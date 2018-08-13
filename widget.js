
// Widget class
function PlacePickerWidget(options) {
    const self = this;

    self.options = options || {};
    self.inputId = options.inputId;
    self.onPlaceChanged = options.onPlaceChanged;

    self.autocompleteService = new google.maps.places.AutocompleteService();
    self.placesService = new google.maps.places.PlacesService($('.places-service')[0]);

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
        radius: null // radius in meters
    };
    self.setLimits = function(latlng, radius) {
        if (latlng) self.limits.location = new google.maps.LatLng(latlng.lat, latlng.lng);
        else self.limits.location = null;
        self.limits.radius = radius;
    };

    // cache geocoding results to save api calls
    self.cache = {};
    self.cache_placeDetails = {};

    // html elements
    self.htmlDropdownList = $('#' + self.inputId + ' + .location-dropdown ul');
    self.htmlDropdownDiv = $('#' + self.inputId + ' + .location-dropdown');
    self.htmlInput = $('#' + self.inputId);

    //self.htmlLoader = $('<li class="loader-list-elem"><div class="justify-content-center"><div class="loader"></div></div></li>');

    self.htmlInput.on('input', function (e) {
        const input_text = e.target.value;

        if (input_text) {

            if (true || !self.cache[input_text]) {
                self.showDropdown(true);
                self.scheduleCallback(200, function () {
                    self.queryPredictions(input_text, function (predictions) {
                        self.state.currentPredictions = predictions;
                        self.renderPredictions(predictions);
                        // cache results
                        self.cache[input_text] = predictions;
                    });
                }, console.error);

            } else {
                self.state.currentPredictions = self.cache[input_text];
                self.renderPredictions(self.cache[input_text]);
            }

        } else {
            self.state.currentPredictions = [];
            self.showDropdown(false);
        }
    });

    self.queryPredictions = function(input_text, success, error) {

        const params = {input: input_text};
        if (self.limits.location) params.location = self.limits.location;
        if (self.limits.radius) params.radius = self.limits.radius;

        self.autocompleteService.getQueryPredictions(params, function (predictions, status) {
            if (status === google.maps.places.PlacesServiceStatus.OK) {
                success(predictions, status);
            } else {
                if (error) error(predictions, status);
            }
        });
    };

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

    self.scheduleCallback = function (time, callback) {
        if (self.timer) {
            clearTimeout(self.timer);
        }
        self.timer = setTimeout(callback, time);
    };

    self.cancelSchedule = function () {
        if (self.timer) {
            clearTimeout(self.timer);
        }
        self.timer = null;
    };

    self.runWorker = function() {

    };

    self.searchPlace = function(query) {
        self.placesService.findPlaceFromQuery({query: query, fields: ['name', 'types']}, function (result, status) {
            console.log(result, status);
        });
    };

    self.renderPredictions = function(predictions) {
        self.htmlDropdownList.empty();
        for (var i = 0; i < predictions.length; ++i) {
            const listElem = $(self.renderPlaceListItem(i, predictions[i])).appendTo(self.htmlDropdownList);
            const imgElem = listElem.find('img');
            const spanElem = listElem.find('span');
            if (predictions[i].place_id) {
                self.queryPlaceDetails(predictions[i].place_id, function (details, status) {
                    spanElem.html(self.determineSpan(details.types));
                    imgElem.attr('src', 'img/icons/' + self.determineIcon(details.types));
                }, console.error);
            }
            listElem.on('click', self.onPlaceListItemClick);
        }
        self.htmlDropdownDiv.css('display', 'block');
    };

    self.renderPlaceListItem = function (i, place) {
        if (place) {
            return '<li data-index="' + i + '" ' + (place.place_id ? ('place-id="' + place.place_id + '"') : '') +
                '><div><img src="img/icons/' + self.determineIcon() + '" align="left"><div>'
                    + place.description +
                '<span>' + self.determineSpan(place.types) + '</span></div>' +
                '</div></li>';
        }
        else return '';
    };

    self.onPlaceListItemClick = function (e) {
        const place_id = $(this).attr('place-id');
        const prediction = self.state.currentPredictions[$(this).attr('data-index')];

        self.htmlInput.val(prediction.description);
        self.state.currentPlace = place_id ? place_id : null;
        if (self.onPlaceChanged) self.onPlaceChanged(self, place_id);
        self.showDropdown(false);
        e.stopPropagation();
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
        if (!$.isArray(place_types)) return 'Street Address';
        if (place_types.contains('airport')) {
            return 'Airport';

        } else if (place_types.contains('train_station')) {
            return 'Train Station';

        } else if (place_types.contains('bus_station')) {
            return 'Bus Station';

        } else if (place_types.contains('restaurant')) {
            return 'Restaurant';

        } else if (place_types.contains('night_club')) {
            return 'Night Club';

        } else if (place_types.contains('establishment')){
            return 'Business';
        } else {
            return 'Street Address';
        }
    };

    self.loader = function(onoff) {
        if (onoff === "on") {
            self.htmlLoader.prependTo(self.htmlDropdownList);
        } else {
            self.htmlLoader.detach();
        }
    };

    self.showDropdown = function(flag) { self.htmlDropdownDiv.css('display', flag ? 'block' : 'none'); }
    self.htmlInput.on('focusin', function () {
        if (self.htmlInput.val()) self.showDropdown(true);
    });
    self.htmlInput.on('focusout', function () { setTimeout(function() {
        self.showDropdown(false); }, 200);
    });

    self.getPlaceId = function() {
        return self.state.currentPlace;
    }
}