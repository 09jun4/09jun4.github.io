// three-csm.js — three.js r128 examples/js/csm (Frustum.js, CSMShader.js, CSM.js), MIT License, (c) three.js authors.
// Concatenated in load order. One change: the CSM frustum helper is exported as THREE.CSMFrustum
// (the original assigned THREE.Frustum and clobbered the core class). Used by circuit/js/gfx (높음 그래픽) only.
( function () {

	const inverseProjectionMatrix = new THREE.Matrix4();

	class Frustum {

		constructor( data ) {

			data = data || {};
			this.vertices = {
				near: [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ],
				far: [ new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3() ]
			};

			if ( data.projectionMatrix !== undefined ) {

				this.setFromProjectionMatrix( data.projectionMatrix, data.maxFar || 10000 );

			}

		}

		setFromProjectionMatrix( projectionMatrix, maxFar ) {

			const isOrthographic = projectionMatrix.elements[ 2 * 4 + 3 ] === 0;
			inverseProjectionMatrix.copy( projectionMatrix ).invert(); // 3 --- 0  vertices.near/far order
			// |     |
			// 2 --- 1
			// clip space spans from [-1, 1]

			this.vertices.near[ 0 ].set( 1, 1, - 1 );
			this.vertices.near[ 1 ].set( 1, - 1, - 1 );
			this.vertices.near[ 2 ].set( - 1, - 1, - 1 );
			this.vertices.near[ 3 ].set( - 1, 1, - 1 );
			this.vertices.near.forEach( function ( v ) {

				v.applyMatrix4( inverseProjectionMatrix );

			} );
			this.vertices.far[ 0 ].set( 1, 1, 1 );
			this.vertices.far[ 1 ].set( 1, - 1, 1 );
			this.vertices.far[ 2 ].set( - 1, - 1, 1 );
			this.vertices.far[ 3 ].set( - 1, 1, 1 );
			this.vertices.far.forEach( function ( v ) {

				v.applyMatrix4( inverseProjectionMatrix );
				const absZ = Math.abs( v.z );

				if ( isOrthographic ) {

					v.z *= Math.min( maxFar / absZ, 1.0 );

				} else {

					v.multiplyScalar( Math.min( maxFar / absZ, 1.0 ) );

				}

			} );
			return this.vertices;

		}

		split( breaks, target ) {

			while ( breaks.length > target.length ) {

				target.push( new Frustum() );

			}

			target.length = breaks.length;

			for ( let i = 0; i < breaks.length; i ++ ) {

				const cascade = target[ i ];

				if ( i === 0 ) {

					for ( let j = 0; j < 4; j ++ ) {

						cascade.vertices.near[ j ].copy( this.vertices.near[ j ] );

					}

				} else {

					for ( let j = 0; j < 4; j ++ ) {

						cascade.vertices.near[ j ].lerpVectors( this.vertices.near[ j ], this.vertices.far[ j ], breaks[ i - 1 ] );

					}

				}

				if ( i === breaks - 1 ) {

					for ( let j = 0; j < 4; j ++ ) {

						cascade.vertices.far[ j ].copy( this.vertices.far[ j ] );

					}

				} else {

					for ( let j = 0; j < 4; j ++ ) {

						cascade.vertices.far[ j ].lerpVectors( this.vertices.near[ j ], this.vertices.far[ j ], breaks[ i ] );

					}

				}

			}

		}

		toSpace( cameraMatrix, target ) {

			for ( var i = 0; i < 4; i ++ ) {

				target.vertices.near[ i ].copy( this.vertices.near[ i ] ).applyMatrix4( cameraMatrix );
				target.vertices.far[ i ].copy( this.vertices.far[ i ] ).applyMatrix4( cameraMatrix );

			}

		}

	}

	THREE.CSMFrustum = Frustum;

} )();
( function () {

	const CSMShader = {
		lights_fragment_begin:
  /* glsl */
  `
GeometricContext geometry;

geometry.position = - vViewPosition;
geometry.normal = normal;
geometry.viewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );

#ifdef CLEARCOAT

	geometry.clearcoatNormal = clearcoatNormal;

#endif

IncidentLight directLight;

#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )

	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {

		pointLight = pointLights[ i ];

		getPointDirectLightIrradiance( pointLight, geometry, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif

		RE_Direct( directLight, geometry, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )

	SpotLight spotLight;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {

		spotLight = spotLights[ i ];

		getSpotDirectLightIrradiance( spotLight, geometry, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotShadowCoord[ i ] ) : 1.0;
		#endif

		RE_Direct( directLight, geometry, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if ( NUM_DIR_LIGHTS > 0) && defined( RE_Direct ) && defined( USE_CSM ) && defined( CSM_CASCADES )

	DirectionalLight directionalLight;
	float linearDepth = (vViewPosition.z) / (shadowFar - cameraNear);
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	#if defined( USE_SHADOWMAP ) && defined( CSM_FADE )
	vec2 cascade;
	float cascadeCenter;
	float closestEdge;
	float margin;
	float csmx;
	float csmy;

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];
		getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );

		// NOTE: Depth gets larger away from the camera.
		// cascade.x is closer, cascade.y is further
		cascade = CSM_cascades[ i ];
		cascadeCenter = ( cascade.x + cascade.y ) / 2.0;
		closestEdge = linearDepth < cascadeCenter ? cascade.x : cascade.y;
		margin = 0.25 * pow( closestEdge, 2.0 );
		csmx = cascade.x - margin / 2.0;
		csmy = cascade.y + margin / 2.0;
		if( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS && linearDepth >= csmx && ( linearDepth < csmy || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1 ) ) {

			float dist = min( linearDepth - csmx, csmy - linearDepth );
			float ratio = clamp( dist / margin, 0.0, 1.0 );
			if( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS ) {

				vec3 prevColor = directLight.color;
				directionalLightShadow = directionalLightShadows[ i ];
				directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;

				bool shouldFadeLastCascade = UNROLLED_LOOP_INDEX == CSM_CASCADES - 1 && linearDepth > cascadeCenter;
				directLight.color = mix( prevColor, directLight.color, shouldFadeLastCascade ? ratio : 1.0 );

			}

			ReflectedLight prevLight = reflectedLight;
			RE_Direct( directLight, geometry, material, reflectedLight );

			bool shouldBlend = UNROLLED_LOOP_INDEX != CSM_CASCADES - 1 || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1 && linearDepth < cascadeCenter;
			float blendRatio = shouldBlend ? ratio : 1.0;

			reflectedLight.directDiffuse = mix( prevLight.directDiffuse, reflectedLight.directDiffuse, blendRatio );
			reflectedLight.directSpecular = mix( prevLight.directSpecular, reflectedLight.directSpecular, blendRatio );
			reflectedLight.indirectDiffuse = mix( prevLight.indirectDiffuse, reflectedLight.indirectDiffuse, blendRatio );
			reflectedLight.indirectSpecular = mix( prevLight.indirectSpecular, reflectedLight.indirectSpecular, blendRatio );

		}

	}
	#pragma unroll_loop_end
	#else

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];
		getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )

		directionalLightShadow = directionalLightShadows[ i ];
		if(linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y) directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;

		#endif

		if(linearDepth >= CSM_cascades[UNROLLED_LOOP_INDEX].x && (linearDepth < CSM_cascades[UNROLLED_LOOP_INDEX].y || UNROLLED_LOOP_INDEX == CSM_CASCADES - 1)) RE_Direct( directLight, geometry, material, reflectedLight );

	}
	#pragma unroll_loop_end

	#endif

#endif


#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct ) && !defined( USE_CSM ) && !defined( CSM_CASCADES )

	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {

		directionalLight = directionalLights[ i ];

		getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );

		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= all( bvec2( directLight.visible, receiveShadow ) ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif

		RE_Direct( directLight, geometry, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )

	RectAreaLight rectAreaLight;

	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {

		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometry, material, reflectedLight );

	}
	#pragma unroll_loop_end

#endif

#if defined( RE_IndirectDiffuse )

	vec3 iblIrradiance = vec3( 0.0 );

	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );

	irradiance += getLightProbeIrradiance( lightProbe, geometry );

	#if ( NUM_HEMI_LIGHTS > 0 )

		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {

			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometry );

		}
		#pragma unroll_loop_end

	#endif

#endif

#if defined( RE_IndirectSpecular )

	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );

#endif
`,
		lights_pars_begin:
  /* glsl */
  `
#if defined( USE_CSM ) && defined( CSM_CASCADES )
uniform vec2 CSM_cascades[CSM_CASCADES];
uniform float cameraNear;
uniform float shadowFar;
#endif
	` + THREE.ShaderChunk.lights_pars_begin
	};

	THREE.CSMShader = CSMShader;

} )();
( function () {

	const _cameraToLightMatrix = new THREE.Matrix4();

	const _lightSpaceFrustum = new THREE.CSMFrustum();

	const _center = new THREE.Vector3();

	const _bbox = new THREE.Box3();

	const _uniformArray = [];
	const _logArray = [];
	class CSM {

		constructor( data ) {

			data = data || {};
			this.camera = data.camera;
			this.parent = data.parent;
			this.cascades = data.cascades || 3;
			this.maxFar = data.maxFar || 100000;
			this.mode = data.mode || 'practical';
			this.shadowMapSize = data.shadowMapSize || 2048;
			this.shadowBias = data.shadowBias || 0.000001;
			this.lightDirection = data.lightDirection || new THREE.Vector3( 1, - 1, 1 ).normalize();
			this.lightIntensity = data.lightIntensity || 1;
			this.lightNear = data.lightNear || 1;
			this.lightFar = data.lightFar || 2000;
			this.lightMargin = data.lightMargin || 200;
			this.customSplitsCallback = data.customSplitsCallback;
			this.fade = false;
			this.mainFrustum = new THREE.CSMFrustum();
			this.frustums = [];
			this.breaks = [];
			this.lights = [];
			this.shaders = new Map();
			this.createLights();
			this.updateFrustums();
			this.injectInclude();

		}

		createLights() {

			for ( let i = 0; i < this.cascades; i ++ ) {

				const light = new THREE.DirectionalLight( 0xffffff, this.lightIntensity );
				light.castShadow = true;
				light.shadow.mapSize.width = this.shadowMapSize;
				light.shadow.mapSize.height = this.shadowMapSize;
				light.shadow.camera.near = this.lightNear;
				light.shadow.camera.far = this.lightFar;
				light.shadow.bias = this.shadowBias;
				this.parent.add( light );
				this.parent.add( light.target );
				this.lights.push( light );

			}

		}

		initCascades() {

			const camera = this.camera;
			camera.updateProjectionMatrix();
			this.mainFrustum.setFromProjectionMatrix( camera.projectionMatrix, this.maxFar );
			this.mainFrustum.split( this.breaks, this.frustums );

		}

		updateShadowBounds() {

			const frustums = this.frustums;

			for ( let i = 0; i < frustums.length; i ++ ) {

				const light = this.lights[ i ];
				const shadowCam = light.shadow.camera;
				const frustum = this.frustums[ i ]; // Get the two points that represent that furthest points on the frustum assuming
				// that's either the diagonal across the far plane or the diagonal across the whole
				// frustum itself.

				const nearVerts = frustum.vertices.near;
				const farVerts = frustum.vertices.far;
				const point1 = farVerts[ 0 ];
				let point2;

				if ( point1.distanceTo( farVerts[ 2 ] ) > point1.distanceTo( nearVerts[ 2 ] ) ) {

					point2 = farVerts[ 2 ];

				} else {

					point2 = nearVerts[ 2 ];

				}

				let squaredBBWidth = point1.distanceTo( point2 );

				if ( this.fade ) {

					// expand the shadow extents by the fade margin if fade is enabled.
					const camera = this.camera;
					const far = Math.max( camera.far, this.maxFar );
					const linearDepth = frustum.vertices.far[ 0 ].z / ( far - camera.near );
					const margin = 0.25 * Math.pow( linearDepth, 2.0 ) * ( far - camera.near );
					squaredBBWidth += margin;

				}

				shadowCam.left = - squaredBBWidth / 2;
				shadowCam.right = squaredBBWidth / 2;
				shadowCam.top = squaredBBWidth / 2;
				shadowCam.bottom = - squaredBBWidth / 2;
				shadowCam.updateProjectionMatrix();

			}

		}

		getBreaks() {

			const camera = this.camera;
			const far = Math.min( camera.far, this.maxFar );
			this.breaks.length = 0;

			switch ( this.mode ) {

				case 'uniform':
					uniformSplit( this.cascades, camera.near, far, this.breaks );
					break;

				case 'logarithmic':
					logarithmicSplit( this.cascades, camera.near, far, this.breaks );
					break;

				case 'practical':
					practicalSplit( this.cascades, camera.near, far, 0.5, this.breaks );
					break;

				case 'custom':
					if ( this.customSplitsCallback === undefined ) console.error( 'CSM: Custom split scheme callback not defined.' );
					this.customSplitsCallback( this.cascades, camera.near, far, this.breaks );
					break;

			}

			function uniformSplit( amount, near, far, target ) {

				for ( let i = 1; i < amount; i ++ ) {

					target.push( ( near + ( far - near ) * i / amount ) / far );

				}

				target.push( 1 );

			}

			function logarithmicSplit( amount, near, far, target ) {

				for ( let i = 1; i < amount; i ++ ) {

					target.push( near * ( far / near ) ** ( i / amount ) / far );

				}

				target.push( 1 );

			}

			function practicalSplit( amount, near, far, lambda, target ) {

				_uniformArray.length = 0;
				_logArray.length = 0;
				logarithmicSplit( amount, near, far, _logArray );
				uniformSplit( amount, near, far, _uniformArray );

				for ( let i = 1; i < amount; i ++ ) {

					target.push( THREE.MathUtils.lerp( _uniformArray[ i - 1 ], _logArray[ i - 1 ], lambda ) );

				}

				target.push( 1 );

			}

		}

		update() {

			const camera = this.camera;
			const frustums = this.frustums;

			for ( let i = 0; i < frustums.length; i ++ ) {

				const light = this.lights[ i ];
				const shadowCam = light.shadow.camera;
				const texelWidth = ( shadowCam.right - shadowCam.left ) / this.shadowMapSize;
				const texelHeight = ( shadowCam.top - shadowCam.bottom ) / this.shadowMapSize;
				light.shadow.camera.updateMatrixWorld( true );

				_cameraToLightMatrix.multiplyMatrices( light.shadow.camera.matrixWorldInverse, camera.matrixWorld );

				frustums[ i ].toSpace( _cameraToLightMatrix, _lightSpaceFrustum );
				const nearVerts = _lightSpaceFrustum.vertices.near;
				const farVerts = _lightSpaceFrustum.vertices.far;

				_bbox.makeEmpty();

				for ( let j = 0; j < 4; j ++ ) {

					_bbox.expandByPoint( nearVerts[ j ] );

					_bbox.expandByPoint( farVerts[ j ] );

				}

				_bbox.getCenter( _center );

				_center.z = _bbox.max.z + this.lightMargin;
				_center.x = Math.floor( _center.x / texelWidth ) * texelWidth;
				_center.y = Math.floor( _center.y / texelHeight ) * texelHeight;

				_center.applyMatrix4( light.shadow.camera.matrixWorld );

				light.position.copy( _center );
				light.target.position.copy( _center );
				light.target.position.x += this.lightDirection.x;
				light.target.position.y += this.lightDirection.y;
				light.target.position.z += this.lightDirection.z;

			}

		}

		injectInclude() {

			THREE.ShaderChunk.lights_fragment_begin = THREE.CSMShader.lights_fragment_begin;
			THREE.ShaderChunk.lights_pars_begin = THREE.CSMShader.lights_pars_begin;

		}

		setupMaterial( material ) {

			material.defines = material.defines || {};
			material.defines.USE_CSM = 1;
			material.defines.CSM_CASCADES = this.cascades;

			if ( this.fade ) {

				material.defines.CSM_FADE = '';

			}

			const breaksVec2 = [];
			const scope = this;
			const shaders = this.shaders;

			material.onBeforeCompile = function ( shader ) {

				const far = Math.min( scope.camera.far, scope.maxFar );
				scope.getExtendedBreaks( breaksVec2 );
				shader.uniforms.CSM_cascades = {
					value: breaksVec2
				};
				shader.uniforms.cameraNear = {
					value: scope.camera.near
				};
				shader.uniforms.shadowFar = {
					value: far
				};
				shaders.set( material, shader );

			};

			shaders.set( material, null );

		}

		updateUniforms() {

			const far = Math.min( this.camera.far, this.maxFar );
			const shaders = this.shaders;
			shaders.forEach( function ( shader, material ) {

				if ( shader !== null ) {

					const uniforms = shader.uniforms;
					this.getExtendedBreaks( uniforms.CSM_cascades.value );
					uniforms.cameraNear.value = this.camera.near;
					uniforms.shadowFar.value = far;

				}

				if ( ! this.fade && 'CSM_FADE' in material.defines ) {

					delete material.defines.CSM_FADE;
					material.needsUpdate = true;

				} else if ( this.fade && ! ( 'CSM_FADE' in material.defines ) ) {

					material.defines.CSM_FADE = '';
					material.needsUpdate = true;

				}

			}, this );

		}

		getExtendedBreaks( target ) {

			while ( target.length < this.breaks.length ) {

				target.push( new THREE.Vector2() );

			}

			target.length = this.breaks.length;

			for ( let i = 0; i < this.cascades; i ++ ) {

				const amount = this.breaks[ i ];
				const prev = this.breaks[ i - 1 ] || 0;
				target[ i ].x = prev;
				target[ i ].y = amount;

			}

		}

		updateFrustums() {

			this.getBreaks();
			this.initCascades();
			this.updateShadowBounds();
			this.updateUniforms();

		}

		remove() {

			for ( let i = 0; i < this.lights.length; i ++ ) {

				this.parent.remove( this.lights[ i ] );

			}

		}

		dispose() {

			const shaders = this.shaders;
			shaders.forEach( function ( shader, material ) {

				delete material.onBeforeCompile;
				delete material.defines.USE_CSM;
				delete material.defines.CSM_CASCADES;
				delete material.defines.CSM_FADE;

				if ( shader !== null ) {

					delete shader.uniforms.CSM_cascades;
					delete shader.uniforms.cameraNear;
					delete shader.uniforms.shadowFar;

				}

				material.needsUpdate = true;

			} );
			shaders.clear();

		}

	}

	THREE.CSM = CSM;

} )();
