/**
 * Place picker autocomplete widget for single input
 * @param options
 * @constructor
 */
function PlacePickerWidget(options) {
    const self = this;

    self.options = options || {};
    self.inputId = options.inputId;
    self.onPlaceChanged = options.onPlaceChanged;

    self.predictionsPath = null;

    self.htmlInput = $('#' + self.inputId);

    self.autocomplete = new google.maps.places.Autocomplete(self.htmlInput[0], {
        strictBounds: true,
        fields: ['geometry.location', 'name', 'types']
    });
    self.placesService = new google.maps.places.PlacesService($('.places-service')[0]);

    setTimeout(function () {
        self.pacContainer_jQuery = $('.pac-container');
        self.pacContainer = self.pacContainer_jQuery[options.index];

        self.observer = new MutationObserver(function (mutations) { self.mutationCallback(mutations); });
        self.observer.observe(self.pacContainer, { childList: true });
    }, 500);

    self.autocomplete.addListener('place_changed', function () {
        if(self.onPlaceChanged) self.onPlaceChanged(self, self.autocomplete.getPlace());
    });

    self.timer = null;
    self.interval = null;

    self.state = {
        currentPredictions: [],
        currentPlace: null,
        pendingRequests: 0
    };

    // bounds for prediction places
    self.limits = {
        location: null, // google.maps.LatLng object
        radius: null, // radius in meters
        bounds: null
    };
    self.setLimits = function(latlng, radius) {
        if (latlng) self.limits.location = new google.maps.LatLng(latlng.lat, latlng.lng);
        else self.limits.location = null;
        self.limits.radius = radius;

        // calculate bounds
        if (latlng && radius) {
            const c = new google.maps.Circle({
                radius: radius,
                center: self.limits.location
            });
            self.limits.bounds = c.getBounds();

        } else self.limits.bounds = null;
        self.autocomplete.setBounds(self.limits.bounds);
    };

    self.mutationCallback = function(mutations) {
        let pred = [];
        if (!self.predictionsPath) {
            self.predictionsPath = detectPredictionsPath(self.autocomplete);
        }
        if (self.predictionsPath) {
            pred = self.autocomplete.gm_accessors_.place[self.predictionsPath[0]][self.predictionsPath[1]];
        }
        const predictions = (self.autocomplete.gm_accessors_) ? pred : [];
        self.onPredictionsChanged(predictions.map(function (value) {
            return { name: value.data[0], types: value.data[2], placeId: value.data[8] };
        }));
    };

    self.onPredictionsChanged = function(new_predictions) {
        self.state.currentPredictions = new_predictions;

        const pacitems = self.pacContainer_jQuery.find('.pac-item');
        pacitems.each(function (i, elem) {
            const icon = $(elem).find('.pac-icon');

            if (new_predictions[i]) {
                const request = function () {
                    self.queryPlaceDetails(new_predictions[i].placeId, function (place) {
                        const icon_filename = self.determineIcon(place.types);
                        icon.css('cssText', 'background-image: url("img/icons/' + icon_filename + '") !important;');
                    }, console.warn);
                };
                if (self.state.pendingRequests > 1) {
                    setTimeout(request, self.state.pendingRequests * 500);
                } else request();
            }
        });
    };

    // cache geocoding results to save api calls
    self.cache_placeDetails = {};

    self.queryPlaceDetails = function (place_id, success, error, fields, nocache) {
        if (nocache || !self.cache_placeDetails[place_id]) {
            self.state.pendingRequests++;
            self.placesService.getDetails({
                placeId: place_id,
                fields: (fields ? fields : ['place_id', 'types'])
            }, function (place, status) {
                if (status === google.maps.places.PlacesServiceStatus.OK) {
                    success(place, status);
                    // cache results
                    self.cache_placeDetails[place_id] = place;
                } else {
                    if (error) error(place, status);
                }
                self.state.pendingRequests--;

            });
        } else success(self.cache_placeDetails[place_id], google.maps.places.PlacesServiceStatus.OK);
    };

    self.getPlace = function () {
        return self.htmlInput.val() ? self.autocomplete.getPlace() : undefined;
    };

    self.renderPredictions = function(predictions) {
        for (var i = 0; i < predictions.length; ++i) {
            const listElem = $(self.renderPlaceListItem(i, predictions[i])).appendTo(self.htmlDropdownList);
            const imgElem = listElem.find('img');
            const spanElem = listElem.find('span');
            if (predictions[i].place_id) {
                self.queryPlaceDetails(predictions[i].place_id, function (details, status) {
                    spanElem.html(self.determineSpan(details.types));
                    imgElem.attr('src', 'img/icons/' + self.determineIcon(details.types));
                }, console.warn);
            }
            listElem.on('click', self.onPlaceListItemClick);
        }
    };

    self.determineIcon = function (place_types) {
        if (!$.isArray(place_types)) return 'geocode.png';
        if (place_types.contains('airport')) {
            return 'airport.png';

        } else if (place_types.contains('train_station') || place_types.contains('bus_station')) {
            return 'railway.png';

        } else if (place_types.contains('night_club') || place_types.contains('establishment')) {
            return 'generic-business.png';

        } else {
            return 'geocode.png';
        }
    };

    self.determineSpan = function (place_types) {
        if (!$.isArray(place_types)) return 'Indirizzo Stradale';
        if (place_types.contains('airport')) {
            return 'Aeroporto';

        } else if (place_types.contains('train_station')) {
            return 'Stazione Ferroviaria';

        } else if (place_types.contains('bus_station')) {
            return 'Stazione degli Autobus';

        } else if (place_types.contains('restaurant')) {
            return 'Ristorante';

        } else if (place_types.contains('night_club')) {
            return 'Discoteca';

        } else if (place_types.contains('establishment')){
            return 'Attività Commerciale';
        } else {
            return 'Indirizzo Stradale';
        }
    };

    // define contains func if not defined
    if (!Array.prototype.contains) {
        Array.prototype.contains = function (value) {
            return $.inArray(value, this) !== -1;
        };
    }

}

/**
 * Widget that contains pickup and dropoff inputs + submit button
 * dropoff place is seleted from locations restricted to bounds defined by radius and pickup location
 * @param options
 * @constructor
 */
function PickDropWidget(options) {
    const self = this;

    self.options = options || {};

    self.dropoffRadius = options.dropoffRadius || 100000;

    self.pickupInputId = options.pickupInputId;
    self.dropoffInputId = options.dropoffInputId;
    self.submitBtnId= options.submitBtnId;

    self.onSubmit = options.onSubmit;
    self.onError = options.onError;


    self.pickupW = new PlacePickerWidget({
        inputId: self.pickupInputId,
        index: 0,
        onPlaceChanged: function (widget, place) {
            if (place && place.geometry) {
                self.dropoffW.setLimits({lat: place.geometry.location.lat(), lng: place.geometry.location.lng()},
                    self.dropoffRadius);
            } else {
                self.dropoffW.setLimits(null, null);
            }
        }
    });
    self.dropoffW = new PlacePickerWidget({inputId: self.dropoffInputId, index: 1});

    self.submit = function (e) {
        const pickupplace = self.pickupW.getPlace();
        const dropoffplace = self.dropoffW.getPlace();
        if (self.onSubmit) self.onSubmit(pickupplace, dropoffplace, e);
    };

    self.error = function (error) {
        if (self.onError) self.onError(error);
    };

    self.getPlaces = function () {
        return { pickup: self.pickupW.getPlace(), dropoff: self.dropoffW.getPlace() };
    };

    $('#' + self.submitBtnId).click(self.submit);
}

/**
 * Function that helps to detect proper predictions array path inside google autocomplete object
 */
function detectPredictionsPath(autocomplete) {
    let placeProp = autocomplete.gm_accessors_.place;
    for (let k1 in placeProp) {
        if (placeProp.hasOwnProperty(k1)) {
            let prop1 = placeProp[k1];
            for (let k2 in prop1) {
                if (prop1.hasOwnProperty(k2)) {
                    let prop2 = prop1[k2];
                    if (Array.isArray(prop2)) {
                        if (prop2.length > 0 && prop2[0].hasOwnProperty('data')) {
                            if (Array.isArray(prop2[0].data)) {
                                return [k1, k2];
                            }
                        }
                    }
                }
            }
        }
    }
    return null;
}

// only implement if no native implementation is available
if (typeof Array.isArray === 'undefined') {
    Array.isArray = function(obj) {
        return Object.prototype.toString.call(obj) === '[object Array]';
    }
}