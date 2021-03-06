declare const angular;

import { ISelector } from './selector.interfaces';
import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/merge';
import 'rxjs/add/observable/empty';
import 'rxjs/add/observable/fromEvent';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/debounceTime';
import { Subject } from 'rxjs/Subject';
import { Subscription } from 'rxjs/Subscription';
import { CONSTANTS } from './selector.constants';
import { debug } from 'util';

export class SelectorComponent {

    public restrict: string = 'EAC';
    public replace: boolean = true;
    public transclude: boolean = true;
    public templateUrl: string = 'selector-on-steroids/selector.html';
    public scope: ISelector.BaseComponent.Scope | any = {
        name: '@?',
        value: '=model',
        disabled: '=?disable',
        disableSearch: '=?',
        required: '=?require',
        multiple: '=?multi',
        placeholder: '@?',
        valueAttr: '@',
        labelAttr: '@?',
        groupAttr: '@?',
        options: '=?',
        debounce: '=?',
        create: '&?',
        limit: '=?',
        rtl: '=?',
        api: '=?',
        change: '&?',
        remote: '&?',
        remoteParam: '@?',
        remoteValidation: '&?',
        remoteValidationParam: '@?',
        removeButton: '=?',
        softDelete: '=?',
        closeAfterSelection: '=?',
        viewItemTemplate: '=?',
        dropdownItemTemplate: '=?',
        dropdownCreateTemplate: '=?',
        dropdownGroupTemplate: '=?',
        steroids: '<'
    };

    constructor(
        private $filter: angular.IFilterService,
        private $timeout: angular.ITimeoutService,
        private $window: angular.IWindowService,
        private $http: angular.IHttpService,
        private $q: angular.IQService,
        private $log: angular.ILogService,
        private debug) {
    }

    link(scope: ISelector.BaseComponent.Scope,
        element: angular.IAugmentedJQuery,
        attrs: angular.IAttributes,
        controller: angular.IController,
        transclude: angular.ITranscludeFunction) {


        transclude(scope, (clone: any, scope: ISelector.BaseComponent.Scope) => {

            let _watchers: Array<any> = [];
            let _mutations: Array<any> = [];
            let _subscribers: Array<Subscription> = [];

            const filter = this.$filter('filter');
            const DOM_SELECTOR_CONTAINER = angular.element(element[0]);
            const DOM_SELECTOR_DROPDOWN = angular.element(element[0].querySelector('.selector-dropdown'));
            const DOM_SELECTOR_INPUT = angular.element(element[0].querySelector('.selector-input input'));

            const OBSERVABLE_FOR_DOM_SELECTOR_INPUT = DOM_SELECTOR_INPUT
                ? Observable.merge(
                    Observable.fromEvent(DOM_SELECTOR_INPUT, 'focus'),
                    Observable.fromEvent(DOM_SELECTOR_INPUT, 'blur'),
                    Observable.fromEvent(DOM_SELECTOR_INPUT, 'keydown'),
                    Observable.fromEvent(DOM_SELECTOR_INPUT, 'input')
                )
                : Observable.empty();
            const OBSERVABLE_FOR_DOM_SELECTOR_DROPDOWN = DOM_SELECTOR_DROPDOWN
                ? Observable.fromEvent(DOM_SELECTOR_DROPDOWN, 'mousedown')
                : Observable.empty();
            const OBSERVABLE_FOR_WINDOW_RESIZE = this.$window
                ? Observable.fromEvent(this.$window, 'resze')
                : Observable.empty();

            let inputCtrl = DOM_SELECTOR_INPUT.controller('ngModel');
            let selectCtrl = element.find('select').controller('ngModel');
            let initDeferred = this.$q.defer();
            let defaults = {
                api: {},
                search: '',
                disableSearch: false,
                selectedValues: [],
                highlighted: 0,
                valueAttr: null,
                labelAttr: 'label',
                groupAttr: 'group',
                options: [],
                debounce: 0,
                limit: Infinity,
                remoteParam: 'q',
                remoteValidationParam: 'value',
                removeButton: true,
                viewItemTemplate: 'selector-on-steroids/item-default.html',
                dropdownItemTemplate: 'selector-on-steroids/item-default.html',
                dropdownCreateTemplate: 'selector-on-steroids/item-create.html',
                dropdownGroupTemplate: 'selector-on-steroids/group-default.html',
                steroids: true,
                selectedValuesInput$: new Subject(),
                filteredOptionsInput$: new Subject()
            };

            // DEFAULTS
            // Default: listen to dropdown dom event
            _subscribers.push(
                OBSERVABLE_FOR_DOM_SELECTOR_DROPDOWN.subscribe((e: Event) => {
                    e.preventDefault();
                    e.stopPropagation();
                }, (error) => {
                    CONSTANTS.FUNCTIONS.CONSOLE_LOGGER(this.$log, 'error', error);
                })
            );

            // // Default: listen to window resize event
            _subscribers.push(
                OBSERVABLE_FOR_WINDOW_RESIZE.subscribe((e: Event) => {
                    dropdownPosition();
                }, (error) => {
                    CONSTANTS.FUNCTIONS.CONSOLE_LOGGER(this.$log, 'error', error);
                })
            )

            // Default attributes
            if (!angular.isDefined(scope.value) && scope.multiple) {
                scope.value = [];
            };

            // this is where default initialization happens
            angular.forEach(defaults, (value, key) => {
                if (!angular.isDefined(scope[key])) {
                    scope[key] = value;
                };
            });

            // create custom scope properties
            // scope.onNgModelChanged = (propertyName, oldValue, newValue) => { // watch alternative - model change listener
            //     if (propertyName === `search`) {
            //         if (scope.remote) {
            //             this.$timeout(fetch);
            //         }
            //     }
            // };

            const _onSelectedValuesChanged = (oldValue, newValue) => {
                setTimeout(() => {
                    if (angular.equals(newValue, oldValue)) {
                        return;
                    }
                    updateValue();
                    if (angular.isFunction(scope.change)) {
                        scope.change(scope.multiple
                            ? {
                                newValue: newValue,
                                oldValue: oldValue
                            }
                            : {
                                newValue: (newValue || [])[0],
                                oldValue: (oldValue || [])[0]
                            }
                        );
                    }
                    if (scope.steroids) {
                        this.$timeout(() => {
                            scope.selectedValuesInput$.next({
                                groupAttr: scope.groupAttr,
                                valueAttr: scope.valueAttr,
                                labelAttr: scope.labelAttr,
                                getObjValue: scope.getObjValue,
                                unset: scope.unset,
                                selectedValues: scope.selectedValues,
                                multiple: scope.multiple,
                                disabled: scope.disabled
                            } as ISelector.SelectedItemsComponent.Input$);
                        })
                    }
                });
            };

            const _onFilteredOptionsChanged = () => {
                setTimeout(() => {
                    scope.filteredOptionsInput$.next({
                        groupAttr: scope.groupAttr,
                        valueAttr: scope.valueAttr,
                        labelAttr: scope.labelAttr,
                        getObjValue: scope.getObjValue,
                        filteredOptions: scope.filteredOptions,
                        highlighted: scope.highlighted,
                        set: scope.set,
                        highlight: scope.highlight
                    } as ISelector.DropdownItemsComponent.Input$);
                });
            }

            angular.forEach([
                'name',
                'valueAttr',
                'labelAttr'
            ], (attr) => {
                if (!attrs[attr]) {
                    attrs[attr] = scope[attr]
                };
            });

            // Options' utilities
            const optionValue = (option) => {
                return scope.valueAttr == null
                    ? option
                    : scope.getObjValue(option, scope.valueAttr);
            };

            const setObjValue = (obj, path, value) => {
                let key;
                if (!angular.isDefined(obj)) {
                    obj = {}
                };
                path = angular.isArray(path)
                    ? path
                    : path.split('.');
                key = path.shift();
                if (key.indexOf('[') > 0) {
                    const match = key.match(/(\w+)\[(\d+)\]/);
                    if (match !== null) {
                        obj = obj[match[1]];
                        key = match[2];
                    }
                }
                obj[key] = path.length === 0
                    ? value
                    : setObjValue(obj[key], path, value);
                return obj;
            };

            const optionEquals = (option, value?) => {
                return angular.equals(optionValue(option), angular.isDefined(value)
                    ? value
                    : scope.value);
            };

            scope.getObjValue = (obj, path) => {
                if (!angular.isDefined(obj) || !angular.isDefined(path)) {
                    return obj;
                }
                path = angular.isArray(path)
                    ? path
                    : path.split('.');

                let key = path.shift();
                if (key.indexOf('[') > 0) {
                    const match = key.match(/(\w+)\[(\d+)\]/);
                    if (match !== null) {
                        obj = obj[match[1]];
                        key = match[2];
                    }
                }
                return path.length === 0
                    ? obj[key]
                    : scope.getObjValue(obj[key], path);
            };

            // Value utilities
            const setValue = (value) => {
                scope.value =
                    (!scope.multiple)
                        ? scope.valueAttr == null
                            ? value
                            : scope.getObjValue(value || {}, scope.valueAttr)
                        : scope.valueAttr == null
                            ? (value || [])
                            : (value || [])
                                .map((option) => {
                                    return scope.getObjValue(option, scope.valueAttr);
                                });
            }

            scope.hasValue = () => {
                return scope.multiple ? (scope.value || [])
                    .length > 0 : !!scope.value;
            };

            // Remote fetching
            const request = (paramName, paramValue, remote, remoteParam) => {
                let promise;
                let remoteOptions = {};

                if (scope.disabled) {
                    return this.$q.reject();
                }

                if (!angular.isDefined(remote)) {
                    throw 'Remote attribute is not defined';
                }

                scope.loading = true;
                scope.options = [];
                remoteOptions[paramName] = paramValue;
                promise = remote(remoteOptions);

                if (typeof promise.then !== 'function') {
                    const settings = {
                        method: 'GET',
                        cache: true,
                        params: {}
                    };
                    angular.extend(settings, promise);
                    angular.extend(settings.params, promise.params);
                    settings.params[remoteParam] = paramValue;
                    promise = this.$http(settings as any);
                }

                promise.then(
                    (response) => {
                        this.$timeout(() => {
                            scope.$apply(() => {
                                const options = response.data || response;
                                scope.options = options;
                                filterOptions();
                                scope.loading = false;
                                initDeferred.resolve();
                            });
                        });
                    },
                    (error) => {
                        this.$timeout(() => {
                            scope.$apply(() => {
                                scope.loading = false;
                            });
                        });
                        initDeferred.reject();
                        const errorMsg = 'Error while fetching data: ' + (error.message || error);
                        CONSTANTS.FUNCTIONS.CONSOLE_LOGGER(this.$log, 'error', errorMsg);
                        throw errorMsg;
                    });

                return promise;
            };

            const fetch = (triggeredFromAction: boolean) => {
                if (triggeredFromAction) {
                    return request('search', scope.search || '', scope.remote, scope.remoteParam);
                } else {
                    return request('search', scope.search || '', scope.remote, scope.remoteParam);
                }
            };

            const fetchValidation = (value) => {
                return request('value', value, scope.remoteValidation, scope.remoteValidationParam);
            };

            if (!angular.isDefined(scope.remote)) {
                scope.remote = false;
                scope.remoteValidation = false;
                initDeferred.resolve();
            } else {
                if (!angular.isDefined(scope.remoteValidation)) {
                    scope.remoteValidation = false;
                }
            }
            if (scope.remote) {
                this.$timeout(() => {
                    this.$q
                        .when(
                        !scope.hasValue() || !scope.remoteValidation
                            ? angular.noop
                            : fetchValidation(scope.value)
                        ).then(() => {
                            _watchers.push(
                                scope.$watch('search', () => {
                                    scope.$evalAsync(fetch(false));
                                })
                            );
                        });
                });
            }

            // Fill with options in the select
            const optionToObject = (option, group?) => {
                let object = {};
                const element = angular.element(option);

                angular.forEach(option.dataset, (value, key) => {
                    if (!key.match(/^\$/)) {
                        object[key] = value
                    };
                });
                if (option.value) {
                    setObjValue(object, scope.valueAttr || 'value', option.value);
                }
                if (element.text()) {
                    setObjValue(object, scope.labelAttr, element.text()
                        .trim());
                }
                if (angular.isDefined(group)) {
                    setObjValue(object, scope.groupAttr, group);
                }
                scope.options.push(object);

                if (element.attr('selected') && (scope.multiple || !scope.hasValue()))
                    if (!scope.multiple) {
                        if (!scope.value) {
                            scope.value = optionValue(object)
                        };
                    } else {
                        if (!scope.value) {
                            scope.value = [];
                        }
                        scope.value.push(optionValue(object));
                    }
            };

            const fillWithHtml = () => {
                scope.options = [];
                angular.forEach(clone, (element) => {
                    const tagName = (element.tagName || '').toLowerCase();
                    if (tagName == 'option') {
                        optionToObject(element);
                    }
                    if (tagName == 'optgroup') {
                        angular.forEach(element.querySelectorAll('option'), (option) => {
                            optionToObject(option, (element.attributes.label || {}).value);
                        });
                    }
                });
                updateSelected();
            };

            // Initialization
            const initialize = () => {
                if (!scope.remote &&
                    (!angular.isArray(scope.options) || !scope.options.length)) {
                    fillWithHtml();
                }
                if (scope.hasValue()) {
                    if (!scope.multiple) {
                        if (angular.isArray(scope.value)) {
                            scope.value = scope.value[0];
                        }
                    } else {
                        if (!angular.isArray(scope.value)) {
                            scope.value = [scope.value];
                        }
                    }
                    updateSelected();
                    filterOptions();
                    updateValue();
                }
            };

            const reInitMultiple = () => {
                this.$timeout(setInputWidth);
                if (scope.remote) {
                    this.$timeout(fetch(false));
                }
                initDeferred
                    .promise
                    .then(() => {
                        initialize();
                    }, () => {
                        if (this.debug) {
                            CONSTANTS.FUNCTIONS.CONSOLE_LOGGER(this.$log, 'debug', `Cannot initialize, promise init error!`);
                        }
                    });
            }

            let _previousClassString: string = null;
            const m2 = new MutationObserver((event) => {
                const newClassString = (event[0].target as HTMLElement).classList.toString();
                if (_previousClassString &&
                    newClassString !== _previousClassString) {
                    const newHasMultiple = (newClassString.indexOf('multiple') !== -1);
                    const oldHasMultiple = (_previousClassString.indexOf('multiple') !== -1);
                    if (newHasMultiple !== oldHasMultiple) {
                        reInitMultiple();
                    }
                }
                // on first init
                if (!_previousClassString) {
                    reInitMultiple();
                }
                _previousClassString = newClassString;
            })
            m2.observe(DOM_SELECTOR_CONTAINER[0], {
                attributes: true,
                attributeFilter: ['class']
            });
            _mutations.push(m2);

            // Dropdown utilities
            const dropdownPosition = () => {
                const label = DOM_SELECTOR_INPUT.parent()[0];
                const styles = CONSTANTS.FUNCTIONS.GET_DOM_STYLES(label);
                const marginTop = parseFloat((<any>styles).marginTop || 0);
                const marginLeft = parseFloat((<any>styles).marginLeft || 0);
                if (label) {
                    DOM_SELECTOR_DROPDOWN.css({
                        top: (label.offsetTop + label.offsetHeight + marginTop) + 'px',
                        left: (label.offsetLeft + marginLeft) + 'px',
                        width: label.offsetWidth + 'px'
                    });
                }
            };

            const open = () => {
                if (scope.multiple &&
                    (scope.selectedValues || []).length >= scope.limit) {
                    return;
                }
                scope.isOpen = true;
                dropdownPosition();
                if (scope.remote) {
                    this.$timeout(fetch(true));
                }
                if (!scope.multiple) {
                    this.$timeout(scrollToHighlighted);
                }
            };

            const close = () => {
                scope.isOpen = false;
                resetInput();
                // Note: not necessary to make a fetch call on close
                // if (scope.remote) {
                //     this.$timeout(fetch);
                // };
            };

            const decrementHighlighted = () => {
                scope.highlight(scope.highlighted - 1);
                scrollToHighlighted();
            };

            const incrementHighlighted = () => {
                scope.highlight(scope.highlighted + 1);
                scrollToHighlighted();
            };

            scope.highlight = (index) => {
                if (attrs.create && scope.search && index == -1) {
                    scope.highlighted = -1;
                }
                else {
                    if (scope.filteredOptions.length) {
                        scope.highlighted = (scope.filteredOptions.length + index) % scope.filteredOptions.length;
                    }
                }
                _onFilteredOptionsChanged();
            };

            const scrollToHighlighted = () => {
                const dd = DOM_SELECTOR_DROPDOWN[0];
                const option = dd.querySelectorAll('li.selector-option.js-data-item')[scope.highlighted] as HTMLElement;
                const styles = CONSTANTS.FUNCTIONS.GET_DOM_STYLES(option);
                const marginTop = parseFloat((<any>styles).marginTop || 0);
                const marginBottom = parseFloat((<any>styles).marginBottom || 0);
                if (!scope.filteredOptions.length) {
                    return;
                }
                if (option) {
                    if (option.offsetTop + option.offsetHeight + marginBottom > dd.scrollTop + dd.offsetHeight) {
                        this.$timeout(() => {
                            dd.scrollTop = option.offsetTop + option.offsetHeight + marginBottom - dd.offsetHeight;
                        });
                    }
                    if (option.offsetTop - marginTop < dd.scrollTop) {
                        this.$timeout(() => {
                            dd.scrollTop = option.offsetTop - marginTop;
                        });
                    }
                }
            };

            scope.createOption = (value) => {
                this.$q
                    .when((() => {
                        let option = {};
                        if (angular.isFunction(scope.create)) {
                            option = scope.create({
                                input: value
                            });
                        } else {
                            setObjValue(option, scope.labelAttr, value);
                            setObjValue(option, scope.valueAttr || 'value', value);
                        }
                        return option;
                    })())
                    .then((option) => {
                        scope.options.push(option);
                        scope.set(option);
                    });
            };

            scope.set = (option?: any) => {

                if (scope.multiple &&
                    (scope.selectedValues || []).length >= scope.limit) {
                    return;
                };
                if (!angular.isDefined(option)) {
                    option = scope.filteredOptions[scope.highlighted];
                }
                if (!option) {
                    return;
                }

                const _oldSelectedValues = angular.copy(scope.selectedValues);
                if (!scope.multiple) {
                    scope.selectedValues = [option];
                }
                else {
                    if (!scope.selectedValues) {
                        scope.selectedValues = [];
                    }
                    if (scope.selectedValues.indexOf(option) < 0) {
                        scope.selectedValues.push(option);
                    }
                }
                if (!scope.multiple || scope.closeAfterSelection ||
                    (scope.selectedValues || []).length >= scope.limit) {
                    close();
                }
                _onSelectedValuesChanged(_oldSelectedValues, scope.selectedValues);
                resetInput();
                selectCtrl.$setDirty();
            };

            scope.unset = (index) => {
                const _oldSelectedValues = angular.copy(scope.selectedValues);
                if (!scope.multiple) {
                    scope.selectedValues = [];
                }
                else {
                    scope.selectedValues.splice(
                        angular.isDefined(index)
                            ? index
                            : scope.selectedValues.length - 1,
                        1);
                }

                _onSelectedValuesChanged(_oldSelectedValues, scope.selectedValues);

                resetInput();
                selectCtrl.$setDirty();
            };

            const keydown = (e) => {
                switch (e.keyCode) {
                    case CONSTANTS.KEYS.up:
                        {
                            if (!scope.isOpen) {
                                break;
                            }
                            decrementHighlighted();
                            e.preventDefault();
                            break;
                        }
                    case CONSTANTS.KEYS.down:
                        {
                            if (!scope.isOpen) {
                                open();
                            }
                            else {
                                incrementHighlighted();
                            }
                            e.preventDefault();
                            break;
                        }
                    case CONSTANTS.KEYS.escape:
                        {
                            scope.highlight(0);
                            close();
                            break;
                        }
                    case CONSTANTS.KEYS.enter:
                        {
                            if (scope.isOpen) {
                                if (attrs.create && scope.search && scope.highlighted == -1) {
                                    scope.createOption(e.target.value);
                                }
                                else {
                                    if (scope.filteredOptions.length) {
                                        scope.set();
                                    }
                                }
                                e.preventDefault();
                            }
                            break;
                        }

                    case CONSTANTS.KEYS.backspace:
                        {
                            if (!DOM_SELECTOR_INPUT.val()) {
                                const search = scope.getObjValue(scope.selectedValues.slice(-1)[0] || {}, scope.labelAttr || '');
                                scope.unset();
                                // open();
                                if (scope.softDelete && !scope.disableSearch)
                                    this.$timeout(() => {
                                        scope.search = search;
                                    });
                                e.preventDefault();
                            }
                            break;
                        }
                    case CONSTANTS.KEYS.left:
                    case CONSTANTS.KEYS.right:
                    case CONSTANTS.KEYS.shift:
                    case CONSTANTS.KEYS.ctrl:
                    case CONSTANTS.KEYS.alt:
                    case CONSTANTS.KEYS.tab:
                    case CONSTANTS.KEYS.leftCmd:
                    case CONSTANTS.KEYS.rightCmd:
                        {
                            break;
                        }
                    default:
                        {
                            if (!scope.multiple && scope.hasValue()) {
                                e.preventDefault();
                            } else {
                                open();
                                scope.highlight(0);
                            }
                            break;
                        }
                }
            };

            // Filtered options
            const inOptions = (options, value) => {
                // if options are fetched from a remote source, it's not possibile to use
                // the simplest check with native `indexOf` function, beacause every object
                // in the results array has it own new address
                if (scope.remote) {
                    return options.filter((option) => {
                        return angular.equals(value, option);
                    }).length > 0;
                }
                else {
                    return options.indexOf(value) >= 0;
                }
            };

            const filterOptions = () => {
                scope.filteredOptions = filter(scope.options || [], scope.search);

                const _oldSelectedValues = angular.copy(scope.selectedValues);
                if (!angular.isArray(scope.selectedValues)) {
                    scope.selectedValues = [];
                }
                if (scope.multiple) {
                    scope.filteredOptions = scope.filteredOptions.filter((option) => {
                        return !inOptions(scope.selectedValues, option);
                    });
                }
                else {
                    const index = scope.filteredOptions.indexOf(scope.selectedValues[0]);
                    if (index >= 0) {
                        scope.highlight(index);
                    };
                }

                _onSelectedValuesChanged(_oldSelectedValues, scope.selectedValues);

                _onFilteredOptionsChanged();
            };

            // Input width utilities
            const measureWidth = () => {
                let width;
                const styles = CONSTANTS.FUNCTIONS.GET_DOM_STYLES(DOM_SELECTOR_INPUT[0]);
                const shadow = angular.element('<span class="selector-shadow"></span>');

                shadow.text(DOM_SELECTOR_INPUT.val() || (!scope.hasValue() ? scope.placeholder : '') || '');
                angular.element(document.body).append(shadow);
                angular.forEach([
                    'fontFamily',
                    'fontSize',
                    'fontWeight',
                    'fontStyle',
                    'letterSpacing',
                    'textTransform',
                    'wordSpacing',
                    'textIndent'
                ], (style) => {
                    shadow.css(style, styles[style]);
                });
                width = shadow[0].offsetWidth;
                shadow.remove();
                return width;
            };

            const setInputWidth = () => {
                const width = measureWidth() + 1;
                DOM_SELECTOR_INPUT.css('width', width + 'px');
            };

            const resetInput = () => {
                DOM_SELECTOR_INPUT.val('');
                setInputWidth();
                this.$timeout(() => {
                    scope.$apply(() => {
                        scope.search = '';
                    });
                });
            };

            _watchers.push(
                scope.$watch('[search, options, value]', () => {
                    // hide selected items
                    filterOptions();
                    this.$timeout(() => {
                        // set input width
                        setInputWidth();
                        // repositionate dropdown
                        if (scope.isOpen) {
                            dropdownPosition();
                        }
                    });
                })
            );

            // Update value
            const updateValue = (origin?) => {
                if (!angular.isDefined(origin)) {
                    origin = scope.selectedValues || [];
                }
                setValue(!scope.multiple ? origin[0] : origin);
            };

            _watchers.push(
                scope.$watchCollection('options', (newValue, oldValue) => {
                    if (angular.equals(newValue, oldValue) || scope.remote) {
                        return;
                    };
                    updateSelected();
                })
            );

            // Update selected values
            const updateSelected = (previousValue?: Array<any>) => {
                const _oldSelectedValues = angular.copy(scope.selectedValues);
                if (!scope.multiple) {
                    const o = (scope.options || []);
                    const f = o.filter((option) => {
                        return optionEquals(option);
                    });
                    const nV = f.slice(0, 1);
                    scope.selectedValues = nV;
                } else {
                    scope.selectedValues = (scope.value || [])
                        .map((value) => {
                            return filter(scope.options, (option) => {
                                return optionEquals(option, value);
                            })[0];
                        }).filter(function (value) { return angular.isDefined(value); }).slice(0, scope.limit);
                }
                _onSelectedValuesChanged(_oldSelectedValues, scope.selectedValues);
            };

            let _timePrevious = Date.now();

            _watchers.push(
                scope.$watch('value', (newValue, oldValue) => {

                    const _timeNow = Date.now();
                    if ((_timeNow - _timePrevious) <= 2) { // edge case to handle double digest
                        return;
                    }
                    _timePrevious = _timeNow;

                    if (angular.equals(newValue, oldValue)) {
                        return;
                    }

                    if (this.debug) {
                        CONSTANTS.FUNCTIONS.CONSOLE_LOGGER(
                            this.$log,
                            'info',
                            `watch::value, ${scope.search}, ${JSON.stringify(oldValue)}, ${JSON.stringify(newValue)}, ${Date.now()}`
                        );
                    }

                    this.$q.when(!scope.remote || !scope.remoteValidation || !scope.hasValue()
                        ? angular.noop
                        : fetchValidation(newValue)
                    ).then(() => {
                        if ((scope.options || []).length > 0) {
                            updateSelected(oldValue as any);
                            filterOptions();
                            updateValue();
                        }
                    });
                }, true)
            );


            // DOM event listeners
            _subscribers.push(
                OBSERVABLE_FOR_DOM_SELECTOR_INPUT.subscribe((e: FocusEvent | KeyboardEvent | Event) => {
                    if (e.type === 'focus') {
                        this.$timeout(() => {
                            scope.$apply(open);
                        });
                    }
                    if (e.type === 'blur') {
                        close();
                    }
                    if (e.type === 'keydown') {
                        scope.$apply(() => {
                            keydown(e);
                        });
                    }
                    if (e.type === 'input') {
                        setInputWidth();
                    }
                }, (error: any) => {
                    CONSTANTS.FUNCTIONS.CONSOLE_LOGGER(this.$log, 'error', error);
                })
            );

            const m1 = new MutationObserver((event) => {
                const _target = (event[0].target as HTMLElement);
                const _inputElem = angular.element(_target).find('input');
                if (_inputElem) {
                    selectCtrl[inputCtrl.$touched
                        ? '$setTouched'
                        : '$setUntouched']();
                    selectCtrl[inputCtrl.$pristine
                        ? '$setPristine'
                        : '$setDirty']();
                }
            })
            m1.observe(DOM_SELECTOR_CONTAINER[0], {
                attributes: true,
                attributeFilter: ['class']
            });
            _mutations.push(m1);

            // Expose APIs
            scope.api.fetch = fetch;
            scope.api.open = open;
            scope.api.close = close;
            scope.api.focus = () => {
                DOM_SELECTOR_INPUT[0].focus();
            };
            scope.api.set = (value) => {
                return scope.value = value;
            };
            scope.api.unset = (value) => {
                const values = !value
                    ? scope.selectedValues
                    : (scope.selectedValues || [])
                        .filter((option) => {
                            return optionEquals(option, value);
                        });
                const indexes =
                    scope.selectedValues
                        .map((option, index) => {
                            return inOptions(values, option)
                                ? index
                                : -1;
                        })
                        .filter((index) => {
                            return index >= 0;
                        });
                angular.forEach(indexes, (index, i) => {
                    scope.unset(index - i);
                });
            };

            // destroy
            scope.$on('$destroy', () => {
                // dispose watchers
                if (_watchers && _watchers.length) {
                    // call all unbind on the watchers
                    _watchers.forEach((wFn: Function) => {
                        if (wFn && angular.isFunction(wFn)) {
                            wFn();
                        }
                    });
                    // reset watchers array
                    _watchers = null;
                }

                // dispose all mutation observers;
                if (_mutations && _mutations.length) {
                    _mutations.forEach((m: MutationObserver) => {
                        m.disconnect();
                    });
                    _mutations = null;
                }

                // dispose subscribers
                if (_subscribers && _subscribers.length) {
                    _subscribers.forEach((s: Subscription) => {
                        s.unsubscribe();
                    });
                    _subscribers = null;
                }
            });

        });
    }


    public static Factory(debug: boolean) {
        let directive = ($filter, $timeout, $window, $http, $q, $log) => {
            return new SelectorComponent($filter, $timeout, $window, $http, $q, $log, debug);
        };
        directive['$inject'] = [
            '$filter',
            '$timeout',
            '$window',
            '$http',
            '$q',
            '$log'
        ];
        return directive;
    }
}