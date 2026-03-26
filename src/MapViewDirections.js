import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Polyline } from 'react-native-maps';
import isEqual from 'lodash.isequal';

const WAYPOINT_LIMIT = 10;
const DEFAULT_DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

/**
 * MapViewDirections — supports two modes:
 *
 * ─── MODE 1: Direct Google Maps (default) ────────────────────────────────────
 *   Use when you pass the API key directly inside the app (no key restrictions).
 *
 *   <MapViewDirections
 *     origin={...}
 *     destination={...}
 *     apikey="YOUR_GOOGLE_MAPS_API_KEY"
 *   />
 *
 * ─── MODE 2: Backend Proxy ───────────────────────────────────────────────────
 *   Use when the Google Maps key has bundle ID / package name restrictions.
 *   Your backend receives the request, calls Google Maps with the restricted key,
 *   and returns the same Google Maps Directions API response format.
 *
 *   <MapViewDirections
 *     origin={...}
 *     destination={...}
 *     useBackendApi={true}
 *     backendUrl="https://your-api.com/directions"
 *     backendAuthToken="YOUR_BACKEND_AUTH_TOKEN"   ← optional (Bearer token)
 *   />
 *
 *   Your backend must return: { status: 'OK', routes: [...] }
 *   (same format as Google Maps Directions API)
 */
class MapViewDirections extends Component {

	constructor(props) {
		super(props);

		this.state = {
			coordinates: null,
			distance: null,
			duration: null,
		};
	}

	componentDidMount() {
		this.fetchAndRenderRoute(this.props);
	}

	componentDidUpdate(prevProps) {
		if (!isEqual(prevProps.origin, this.props.origin) || !isEqual(prevProps.destination, this.props.destination) || !isEqual(prevProps.waypoints, this.props.waypoints) || !isEqual(prevProps.mode, this.props.mode) || !isEqual(prevProps.precision, this.props.precision) || !isEqual(prevProps.splitWaypoints, this.props.splitWaypoints)) {
			if (this.props.resetOnChange === false) {
				this.fetchAndRenderRoute(this.props);
			} else {
				this.resetState(() => {
					this.fetchAndRenderRoute(this.props);
				});
			}
		}
	}

	resetState = (cb = null) => {
		this.setState({
			coordinates: null,
			distance: null,
			duration: null,
		}, cb);
	}

	decode(t) {
		let points = [];
		for (let step of t) {
			let encoded = step.polyline.points;
			let index = 0, len = encoded.length;
			let lat = 0, lng = 0;
			while (index < len) {
				let b, shift = 0, result = 0;
				do {
					b = encoded.charAt(index++).charCodeAt(0) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);

				let dlat = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
				lat += dlat;
				shift = 0;
				result = 0;
				do {
					b = encoded.charAt(index++).charCodeAt(0) - 63;
					result |= (b & 0x1f) << shift;
					shift += 5;
				} while (b >= 0x20);
				let dlng = ((result & 1) != 0 ? ~(result >> 1) : (result >> 1));
				lng += dlng;

				points.push({ latitude: (lat / 1E5), longitude: (lng / 1E5) });
			}
		}
		return points;
	}

	fetchAndRenderRoute = (props) => {

		let {
			origin: initialOrigin,
			destination: initialDestination,
			waypoints: initialWaypoints = [],
			// ── Direct mode props ──────────────────────────────────────────────
			apikey,                                    // Google Maps API key
			directionsServiceBaseUrl = DEFAULT_DIRECTIONS_URL, // Defaults to Google Maps endpoint
			// ── Backend proxy mode props ───────────────────────────────────────
			useBackendApi = false,                     // Set true to use your own backend
			backendUrl,                                // Your backend endpoint URL
			backendAuthToken,                          // Optional: Bearer token for your backend
			// ── Shared props ───────────────────────────────────────────────────
			onStart,
			onReady,
			onError,
			mode = 'DRIVING',
			language = 'en',
			optimizeWaypoints,
			splitWaypoints,
			region,
			precision = 'low',
			timePrecision = 'none',
			channel,
		} = props;

		if (useBackendApi) {
			// Backend proxy mode — resolve URL (backendUrl takes priority over directionsServiceBaseUrl)
			const resolvedBackendUrl = backendUrl || directionsServiceBaseUrl;
			if (!resolvedBackendUrl || resolvedBackendUrl === DEFAULT_DIRECTIONS_URL) {
				console.error('MapViewDirections Error: useBackendApi=true requires backendUrl prop (your backend endpoint)'); // eslint-disable-line no-console
				onError && onError('backendUrl is required when useBackendApi is true');
				return;
			}
		} else {
			// Direct Google Maps mode — apikey is required
			if (!apikey) {
				console.warn('MapViewDirections Error: Missing apikey prop (Google Maps API key)'); // eslint-disable-line no-console
				return;
			}
		}

		if (!initialOrigin || !initialDestination) {
			return;
		}

		// Resolve effective values for the fetch
		const effectiveUrl = useBackendApi
			? (backendUrl || directionsServiceBaseUrl)
			: directionsServiceBaseUrl;

		// In backend mode: backendAuthToken is used; in direct mode: apikey is used
		const effectiveKey = useBackendApi ? backendAuthToken : apikey;

		const timePrecisionString = timePrecision === 'none' ? '' : timePrecision;

		const routes = [];

		if (splitWaypoints && initialWaypoints && initialWaypoints.length > WAYPOINT_LIMIT) {
			const chunckedWaypoints = initialWaypoints.reduce((accumulator, waypoint, index) => {
				const numChunk = Math.floor(index / WAYPOINT_LIMIT);
				accumulator[numChunk] = [].concat((accumulator[numChunk] || []), waypoint);
				return accumulator;
			}, []);

			for (let i = 0; i < chunckedWaypoints.length; i++) {
				routes.push({
					waypoints: chunckedWaypoints[i],
					origin: (i === 0) ? initialOrigin : chunckedWaypoints[i-1][chunckedWaypoints[i-1].length - 1],
					destination: (i === chunckedWaypoints.length - 1) ? initialDestination : chunckedWaypoints[i+1][0],
				});
			}
		} else {
			routes.push({
				waypoints: initialWaypoints,
				origin: initialOrigin,
				destination: initialDestination,
			});
		}

		Promise.all(routes.map((route, index) => {
			let {
				origin,
				destination,
				waypoints,
			} = route;

			if (origin.latitude && origin.longitude) {
				origin = `${origin.latitude},${origin.longitude}`;
			}

			if (destination.latitude && destination.longitude) {
				destination = `${destination.latitude},${destination.longitude}`;
			}

			waypoints = waypoints
				.map(waypoint => (waypoint.latitude && waypoint.longitude) ? `${waypoint.latitude},${waypoint.longitude}` : waypoint)
				.join('|');

			if (optimizeWaypoints) {
				waypoints = `optimize:true|${waypoints}`;
			}

			if (index === 0) {
				onStart && onStart({
					origin,
					destination,
					waypoints: initialWaypoints,
				});
			}

			return (
				this.fetchRoute(effectiveUrl, origin, waypoints, destination, effectiveKey, mode, language, region, precision, timePrecisionString, channel, useBackendApi)
					.then(result => result)
					.catch(errorMessage => Promise.reject(errorMessage))
			);
		})).then(results => {
			const result = results.reduce((acc, { distance, duration, coordinates, fare, legs, waypointOrder }) => {
				acc.coordinates = [...acc.coordinates, ...coordinates];
				acc.distance += distance;
				acc.duration += duration;
				acc.fares = [...acc.fares, fare];
				acc.legs = legs;
				acc.waypointOrder = [...acc.waypointOrder, waypointOrder];
				return acc;
			}, {
				coordinates: [],
				distance: 0,
				duration: 0,
				fares: [],
				legs: [],
				waypointOrder: [],
			});

			this.setState({ coordinates: result.coordinates }, function() {
				if (onReady) {
					onReady(result);
				}
			});
		})
			.catch(errorMessage => {
				this.resetState();
				console.warn(`MapViewDirections Error: ${errorMessage}`); // eslint-disable-line no-console
				onError && onError(errorMessage);
			});
	}

	fetchRoute(url, origin, waypoints, destination, authKeyOrToken, mode, language, region, precision, timePrecision, channel, useBackendApi) {
		if (useBackendApi) {
			return this._fetchRouteFromBackend(url, origin, waypoints, destination, authKeyOrToken, mode, language, region, precision, timePrecision, channel);
		} else {
			return this._fetchRouteFromGoogle(url, origin, waypoints, destination, authKeyOrToken, mode, language, region, precision, timePrecision, channel);
		}
	}

	/**
	 * Direct Google Maps Directions API — GET request.
	 * Uses `apikey` prop as the Google Maps key in the URL query string.
	 */
	_fetchRouteFromGoogle(directionsServiceBaseUrl, origin, waypoints, destination, apikey, mode, language, region, precision, timePrecision, channel) {
		let url = directionsServiceBaseUrl;
		if (typeof directionsServiceBaseUrl === 'string') {
			url += `?origin=${origin}&waypoints=${waypoints}&destination=${destination}&key=${apikey}&mode=${mode.toLowerCase()}&language=${language}&region=${region}`;
			if (timePrecision) {
				url += `&departure_time=${timePrecision}`;
			}
			if (channel) {
				url += `&channel=${channel}`;
			}
		}

		return fetch(url)
			.then(response => response.json())
			.then(json => {
				if (json.status !== 'OK') {
					const errorMessage = json.error_message || json.status || 'Unknown error';
					return Promise.reject(errorMessage);
				}

				if (json.routes.length) {
					const route = json.routes[0];

					return Promise.resolve({
						distance: route.legs.reduce((carry, curr) => {
							return carry + curr.distance.value;
						}, 0) / 1000,
						duration: route.legs.reduce((carry, curr) => {
							return carry + (curr.duration_in_traffic ? curr.duration_in_traffic.value : curr.duration.value);
						}, 0) / 60,
						coordinates: (
							(precision === 'low') ?
								this.decode([{polyline: route.overview_polyline}]) :
								route.legs.reduce((carry, curr) => {
									return [...carry, ...this.decode(curr.steps)];
								}, [])
						),
						fare: route.fare,
						waypointOrder: route.waypoint_order,
						legs: route.legs,
					});
				} else {
					return Promise.reject();
				}
			})
			.catch(err => {
				return Promise.reject(`Error on GMAPS route request: ${err}`);
			});
	}

	/**
	 * Backend Proxy API — POST request (form-encoded).
	 * Uses `backendUrl` as the endpoint and `backendAuthToken` as the Bearer token.
	 * Your backend must return the Google Maps Directions API format:
	 * { status: 'OK', routes: [...] }
	 */
	_fetchRouteFromBackend(backendUrl, origin, waypoints, destination, backendAuthToken, mode, language, region, precision, timePrecision, channel) {
		const encodeParam = (key, value) => {
			if (value === null || value === undefined || value === '') return '';
			return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
		};

		const formDataParts = [];
		formDataParts.push(encodeParam('origin', origin));
		if (waypoints) formDataParts.push(encodeParam('waypoints', waypoints));
		formDataParts.push(encodeParam('destination', destination));
		formDataParts.push(encodeParam('mode', mode.toLowerCase()));
		if (language) formDataParts.push(encodeParam('language', language));
		if (region) formDataParts.push(encodeParam('region', region));
		if (timePrecision) formDataParts.push(encodeParam('departure_time', timePrecision));
		if (channel) formDataParts.push(encodeParam('channel', channel));

		const formDataString = formDataParts.filter(part => part !== '').join('&');

		const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
		if (backendAuthToken) {
			headers['Authorization'] = `Bearer ${backendAuthToken}`;
		}

		return fetch(backendUrl, {
			method: 'POST',
			headers,
			body: formDataString,
		})
			.then(response => {
				if (!response.ok) {
					return response.text().then(text => {
						const errorMsg = text.length > 100 ? text.substring(0, 100) + '...' : text;
						throw new Error(`HTTP ${response.status}: ${errorMsg}`);
					}).catch(() => {
						throw new Error(`HTTP ${response.status}: Failed to parse error response`);
					});
				}
				return response.json().catch(() => {
					throw new Error('Invalid JSON response from backend API');
				});
			})
			.then(json => {
				// Support different response wrapper structures
				let routes = json.routes;
				let status = json.status;

				if (!routes && json.data?.routes) {
					routes = json.data.routes;
					status = json.data.status || status;
				}
				if (!routes && json.getMapsDirectionsResponse?.routes) {
					routes = json.getMapsDirectionsResponse.routes;
					status = json.getMapsDirectionsResponse.status || status;
				}

				if (status && status !== 'OK') {
					return Promise.reject(json.error_message || json.message || status || 'Unknown error');
				}

				if (!routes || routes.length === 0) {
					return Promise.reject(json.error_message || json.message || json.status || 'No routes found');
				}

				const route = routes[0];

				if (!route || !route.legs || !Array.isArray(route.legs) || route.legs.length === 0) {
					return Promise.reject('Route legs data is missing from backend response');
				}

				return Promise.resolve({
					distance: route.legs.reduce((carry, curr) => {
						if (!curr?.distance || typeof curr.distance.value !== 'number') return carry;
						return carry + curr.distance.value;
					}, 0) / 1000,
					duration: route.legs.reduce((carry, curr) => {
						if (!curr) return carry;
						const durationValue = curr.duration_in_traffic?.value || curr.duration?.value;
						if (typeof durationValue !== 'number') return carry;
						return carry + durationValue;
					}, 0) / 60,
					coordinates: (
						(precision === 'low') ?
							(route.overview_polyline?.points ? this.decode([{polyline: route.overview_polyline}]) : []) :
							route.legs.reduce((carry, curr) => {
								if (!curr?.steps || !Array.isArray(curr.steps)) return carry;
								try { return [...carry, ...this.decode(curr.steps)]; }
								catch { return carry; }
							}, [])
					),
					fare: route.fare || null,
					waypointOrder: route.waypoint_order || null,
					legs: route.legs,
				});
			})
			.catch(err => {
				return Promise.reject(`Error on backend route request: ${err}`);
			});
	}

	render() {
		const { coordinates } = this.state;

		if (!coordinates) {
			return null;
		}

		const {
			origin,              // eslint-disable-line no-unused-vars
			waypoints,           // eslint-disable-line no-unused-vars
			splitWaypoints,      // eslint-disable-line no-unused-vars
			destination,         // eslint-disable-line no-unused-vars
			apikey,              // eslint-disable-line no-unused-vars
			backendUrl,          // eslint-disable-line no-unused-vars
			backendAuthToken,    // eslint-disable-line no-unused-vars
			directionsServiceBaseUrl, // eslint-disable-line no-unused-vars
			useBackendApi,       // eslint-disable-line no-unused-vars
			onReady,             // eslint-disable-line no-unused-vars
			onError,             // eslint-disable-line no-unused-vars
			mode,                // eslint-disable-line no-unused-vars
			language,            // eslint-disable-line no-unused-vars
			region,              // eslint-disable-line no-unused-vars
			precision,           // eslint-disable-line no-unused-vars
			...props
		} = this.props;

		return (
			<Polyline coordinates={coordinates} {...props} />
		);
	}

}

MapViewDirections.propTypes = {
	origin: PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.shape({
			latitude: PropTypes.number.isRequired,
			longitude: PropTypes.number.isRequired,
		}),
	]),
	waypoints: PropTypes.arrayOf(
		PropTypes.oneOfType([
			PropTypes.string,
			PropTypes.shape({
				latitude: PropTypes.number.isRequired,
				longitude: PropTypes.number.isRequired,
			}),
		]),
	),
	destination: PropTypes.oneOfType([
		PropTypes.string,
		PropTypes.shape({
			latitude: PropTypes.number.isRequired,
			longitude: PropTypes.number.isRequired,
		}),
	]),

	// ── Direct mode (useBackendApi=false, default) ──────────────────────────────
	/** Google Maps API key. Required when useBackendApi is false. */
	apikey: PropTypes.string,
	/** Override the Google Maps Directions API URL (rarely needed). */
	directionsServiceBaseUrl: PropTypes.string,

	// ── Backend proxy mode (useBackendApi=true) ─────────────────────────────────
	/** Set to true to route requests through your own backend instead of calling Google Maps directly. */
	useBackendApi: PropTypes.bool,
	/** Your backend endpoint URL. Required when useBackendApi is true. */
	backendUrl: PropTypes.string,
	/** Optional Bearer token sent in Authorization header to authenticate with your backend. */
	backendAuthToken: PropTypes.string,

	// ── Shared props ─────────────────────────────────────────────────────────────
	onStart: PropTypes.func,
	onReady: PropTypes.func,
	onError: PropTypes.func,
	mode: PropTypes.oneOf(['DRIVING', 'BICYCLING', 'TRANSIT', 'WALKING']),
	language: PropTypes.string,
	resetOnChange: PropTypes.bool,
	optimizeWaypoints: PropTypes.bool,
	splitWaypoints: PropTypes.bool,
	region: PropTypes.string,
	precision: PropTypes.oneOf(['high', 'low']),
	timePrecision: PropTypes.oneOf(['now', 'none']),
	channel: PropTypes.string,
};

export default MapViewDirections;
