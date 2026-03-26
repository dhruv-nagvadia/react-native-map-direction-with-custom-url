# `react-native-map-direction-with-custom-url`

[![npm Version](https://img.shields.io/npm/v/react-native-map-direction-with-custom-url.svg?style=flat)](https://www.npmjs.com/package/react-native-map-direction-with-custom-url)
[![License](https://img.shields.io/npm/l/react-native-map-direction-with-custom-url.svg)](LICENSE.md)

Directions component for [`react-native-maps`](https://github.com/airbnb/react-native-maps/) – Draw a route between two coordinates, powered by the Google Maps Directions API.

Supports two modes:
- **Direct mode** – call Google Maps API directly from the app using an `apikey`
- **Backend proxy mode** – route requests through your own backend (useful when your Google Maps key has bundle ID / package name restrictions)

## Installation

```
npm install react-native-map-direction-with-custom-url
```

or

```
yarn add react-native-map-direction-with-custom-url
```

## Basic Usage

### Mode 1 — Direct Google Maps API

Pass your Google Maps API key directly:

```js
import MapViewDirections from 'react-native-map-direction-with-custom-url';

const origin = {latitude: 37.3318456, longitude: -122.0296002};
const destination = {latitude: 37.771707, longitude: -122.4053769};
const GOOGLE_MAPS_APIKEY = '…';

<MapView initialRegion={…}>
  <MapViewDirections
    origin={origin}
    destination={destination}
    apikey={GOOGLE_MAPS_APIKEY}
  />
</MapView>
```

### Mode 2 — Backend Proxy (with API key restrictions)

Use this when your Google Maps key has **bundle ID / package name restrictions**. Your backend receives the request, calls Google Maps with the restricted key, and returns the same response format.

```js
import MapViewDirections from 'react-native-map-direction-with-custom-url';

<MapView initialRegion={…}>
  <MapViewDirections
    origin={origin}
    destination={destination}
    useBackendApi={true}
    backendUrl="https://your-api.com/directions"
    backendAuthToken="YOUR_BACKEND_AUTH_TOKEN"
  />
</MapView>
```

Your backend must return a response in the Google Maps Directions API format:
```json
{ "status": "OK", "routes": [...] }
```

The component also supports these wrapper formats from your backend:
```json
{ "data": { "status": "OK", "routes": [...] } }
{ "getMapsDirectionsResponse": { "status": "OK", "routes": [...] } }
```

Once the directions between `origin` and `destination` have been fetched, a `MapView.Polyline` between the two will be drawn. Whenever either changes, new directions will be fetched and rendered.

## Component API

### Props

#### Required

| Prop | Type | Note |
|---|---|---|
| `origin` | `LatLng` or `String` | The origin location to start routing from. |
| `destination` | `LatLng` or `String` | The destination location to start routing to. |

#### Mode 1 — Direct Google Maps

| Prop | Type | Default | Note |
|---|---|---|---|
| `apikey` | `String` | | Your Google Maps Directions API Key. Required when `useBackendApi` is false. |

#### Mode 2 — Backend Proxy

| Prop | Type | Default | Note |
|---|---|---|---|
| `useBackendApi` | `boolean` | `false` | Set to `true` to route requests through your own backend. |
| `backendUrl` | `String` | | Your backend endpoint URL. Required when `useBackendApi` is true. Your backend must return Google Maps Directions API format. |
| `backendAuthToken` | `String` | | Optional Bearer token sent in the `Authorization` header to authenticate with your backend. |

#### Shared Props

| Prop | Type | Default | Note |
|---|---|---|---|
| `waypoints` | [`LatLng` or `String`] | `[]` | Array of waypoints to use between origin and destination. |
| `language` | `String` | `"en"` | The language to use when calculating directions. See [here](https://developers.google.com/maps/documentation/javascript/localization) for more info. |
| `mode` | `String` | `"DRIVING"` | Transportation mode. Allowed values: `"DRIVING"`, `"BICYCLING"`, `"WALKING"`, `"TRANSIT"`. |
| `resetOnChange` | `boolean` | `true` | Set to `false` if you see the directions line glitching when recalculating. |
| `optimizeWaypoints` | `boolean` | `false` | Let Google Maps re-order waypoints for the fastest route. |
| `splitWaypoints` | `boolean` | `false` | Automatically split waypoints into multiple routes to bypass the 10-waypoint API limit. |
| `directionsServiceBaseUrl` | `string` | _(Google's)_ | Override the base URL of the Directions API. Usually not needed. |
| `region` | `String` | | Region hint for string-based origin/destination to help Google Maps resolve the correct location. |
| `precision` | `String` | `"low"` | Polyline detail level. `"low"` = smoothed overview path; `"high"` = full step-by-step path (may hit performance). |
| `timePrecision` | `String` | `"none"` | Set to `"now"` to get real-time traffic info. |
| `channel` | `String` | `null` | Channel parameter for Google Maps billing analytics. |

#### More props

Since the result rendered on screen is a `MapView.Polyline` component, all [`MapView.Polyline` props](https://github.com/airbnb/react-native-maps/blob/master/docs/polyline.md#props) – except for `coordinates` – are also accepted.

```js
<MapViewDirections
  origin={origin}
  destination={destination}
  apikey={GOOGLE_MAPS_APIKEY}
  strokeWidth={3}
  strokeColor="hotpink"
/>
```

#### An extra note on `origin` and `destination`

The values can take several forms:

```js
<MapViewDirections origin={{ latitude: 37.3317876, longitude: -122.0054812 }} destination="…" />
<MapViewDirections origin="37.3317876,-122.0054812" destination="…" />
<MapViewDirections origin="Apple Park Visitor Center" destination="…" />
<MapViewDirections origin="10600 N Tantau Ave, Cupertino, CA 95014, USA" destination="…" />
<MapViewDirections origin="place_id:ChIJW5i0tJC1j4ARoUGtkogTaUU" destination="…" />
```

### Events/Callbacks

| Event Name | Returns | Notes |
|---|---|---|
| `onStart` | `{ origin, destination, waypoints: [] }` | Called when routing has started. |
| `onReady` | `{ distance: Number, duration: Number, coordinates: [], fare: Object, waypointOrder: [[]] }` | Called when routing successfully finished. Distance in km, duration in minutes. |
| `onError` | `errorMessage` | Called when routing has failed. |

## Extended Example

```js
import React, { Component } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import MapView from 'react-native-maps';
import MapViewDirections from 'react-native-map-direction-with-custom-url';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE = 37.771707;
const LONGITUDE = -122.4053769;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

// Option A: Direct mode
const GOOGLE_MAPS_APIKEY = '…';

// Option B: Backend proxy mode
const BACKEND_URL = 'https://your-api.com/directions';
const BACKEND_AUTH_TOKEN = '…';

class Example extends Component {

  constructor(props) {
    super(props);
    this.state = {
      coordinates: [
        { latitude: 37.3317876, longitude: -122.0054812 },
        { latitude: 37.771707, longitude: -122.4053769 },
      ],
    };
    this.mapView = null;
  }

  onMapPress = (e) => {
    this.setState({
      coordinates: [...this.state.coordinates, e.nativeEvent.coordinate],
    });
  }

  render() {
    return (
      <MapView
        initialRegion={{
          latitude: LATITUDE,
          longitude: LONGITUDE,
          latitudeDelta: LATITUDE_DELTA,
          longitudeDelta: LONGITUDE_DELTA,
        }}
        style={StyleSheet.absoluteFill}
        ref={c => this.mapView = c}
        onPress={this.onMapPress}
      >
        {this.state.coordinates.map((coordinate, index) =>
          <MapView.Marker key={`coordinate_${index}`} coordinate={coordinate} />
        )}
        {(this.state.coordinates.length >= 2) && (
          <MapViewDirections
            origin={this.state.coordinates[0]}
            waypoints={(this.state.coordinates.length > 2) ? this.state.coordinates.slice(1, -1) : undefined}
            destination={this.state.coordinates[this.state.coordinates.length - 1]}
            // Direct mode:
            apikey={GOOGLE_MAPS_APIKEY}
            // OR Backend proxy mode:
            // useBackendApi={true}
            // backendUrl={BACKEND_URL}
            // backendAuthToken={BACKEND_AUTH_TOKEN}
            strokeWidth={3}
            strokeColor="hotpink"
            optimizeWaypoints={true}
            onStart={(params) => {
              console.log(`Started routing between "${params.origin}" and "${params.destination}"`);
            }}
            onReady={result => {
              console.log(`Distance: ${result.distance} km`);
              console.log(`Duration: ${result.duration} min.`);
              this.mapView.fitToCoordinates(result.coordinates, {
                edgePadding: {
                  right: (width / 20),
                  bottom: (height / 20),
                  left: (width / 20),
                  top: (height / 20),
                }
              });
            }}
            onError={(errorMessage) => {
              console.log('Routing error:', errorMessage);
            }}
          />
        )}
      </MapView>
    );
  }
}

export default Example;
```

## Changelog

Please see [CHANGELOG](CHANGELOG.md) for more information on what has changed recently.

## Credits

- Dhruv Nagvadia _(https://github.com/dhruv-nagvadia)_ — Backend proxy mode, API key restriction support
- Bram(us) Van Damme _(https://www.bram.us/)_ — Original library
- [All Contributors](../../contributors)

## License

The MIT License (MIT). Please see [License File](LICENSE.md) for more information.
