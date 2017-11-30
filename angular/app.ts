"use strict";

// Angular

import IModule = ng.IModule;
import ILogService = ng.ILogService;

// Angular UI Router
import IState = ng.ui.IState;
import IStateService = ng.ui.IStateService;

// rootScope
import IRootScopeService = ng.IRootScopeService;

// location
import ILocationService = ng.ILocationService;


// import ngMessages from 'angular-messages';

// location provider
/*import ILocationProvider = angular.ILocationProvider;*/

// load all modules
import {ModuleRegistry} from "./modules/commons/modules/module.registry";
const moduleRegistry:ModuleRegistry = require("./modules/modules").moduleRegistry;

// application controller
import {AppController} from "./app.controller";

// Pre-loading the html templates into the Angular's $templateCache
const templateAppUrl:any = require("./app.template.html");

// application routes
import {AppRoute} from "./app.route";

// application config
import {Config} from "./app.config";

//config errors
import {Error} from "./app.error";

// Filter
import { CustomNameFormatting } from "./modules/commons/filters/filters";

// Factory
import { AuthInterceptor, SpinnerInterceptor,AutoDisableOnRequestInterceptor } from "./modules/commons/factory/index";

// Service
import { AuthService, Pagination , StoreService} from "./modules/commons/services/index";

// Component
import {PaginationComponent} from "./modules/commons/components/pagination/pagination.controller";


import {InfiniteScroll} from "./modules/commons/directives/infiniteScroll.directive";
import {Spinner} from 'app/modules/commons/directives/spinner.directive';
import {AutoDisableOnRequest} from 'app/modules/commons/directives/autoDisableOnRequest.directive';
import {ReadOnly} from 'app/modules/commons/directives/readOnly.directive';
import {CustomerService} from 'app/modules/customer/services/index';
/**
 * The application
 */
export class App {
    public static bootstrap():void {
        const modules:any = [];
        modules.push("ui.router");
        modules.push("pascalprecht.translate");
        modules.push("immutable-angular");
        modules.push("ngAnimate");
        modules.push("ngMaterial");
        modules.push("angular-jwt");
        modules.push("ngStorage");
        modules.push("ngTagsInput");

        moduleRegistry.getModuleNames().forEach((entry:string) => {
           modules.push(entry);
        });

        const appModule:IModule = angular.module("appModule", modules);

        appModule.component("app", {
            controller: AppController,
            controllerAs: "vm",
            templateUrl: templateAppUrl,
        });

        new AppRoute().register(appModule);

        // Config
        appModule.constant(Config.id, new Config());

        // Error
        appModule.constant(Error.id, new Error());

        // Filter
        appModule.filter('getFormattedName', () => { return CustomNameFormatting.getFormattedName });
        appModule.filter('matchCountry', () => { return CustomNameFormatting.matchCountry });
        appModule.filter('dateConvertToPST', () => { return CustomNameFormatting.dateConvertToPST });
        appModule.filter('quesCatType', () => { return CustomNameFormatting.quesCatType });
        appModule.filter('capitalizeFirst', () => { return CustomNameFormatting.capitalizeFirst });
        appModule.filter('cleanText', () => { return CustomNameFormatting.cleanText });
        appModule.filter('language', () => { return CustomNameFormatting.language });
        appModule.filter('shortenName', () => { return CustomNameFormatting.shortenName });

        // Factory
        appModule.factory(AuthInterceptor.id, ["$q", "$log", "$injector",
            ($q: ng.IQService, logger: ILogService, $injector: ng.auto.IInjectorService) =>
            new AuthInterceptor($q, logger, $injector )
        ]);
        appModule.factory(SpinnerInterceptor.id, ["$q", "$log", "$injector",
            ($q: ng.IQService, logger: ILogService, $injector: ng.auto.IInjectorService) =>
            new SpinnerInterceptor($q, logger, $injector )
        ]);
        appModule.factory(AutoDisableOnRequestInterceptor.id, ["$q", "$log", "$injector",
            ($q: ng.IQService, logger: ILogService, $injector: ng.auto.IInjectorService) =>
            new AutoDisableOnRequestInterceptor($q, logger, $injector )
        ]);

        // Service
        appModule.service(Pagination.id, Pagination);
        appModule.service(StoreService.id, StoreService);

        // Components
        appModule.component(PaginationComponent.id, new PaginationComponent);

        appModule.directive(InfiniteScroll.id, ["$rootScope", "$window", "$interval",
            ($rootScope:ng.IRootScopeService, $window:ng.IWindowService, $interval:ng.IIntervalService) =>
            new InfiniteScroll($rootScope, $window, $interval)]);
        appModule.directive(ReadOnly.id, ["authService",
            (authService:AuthService) =>
            new ReadOnly(authService)]);

        appModule.directive(Spinner.id, [() => new Spinner()]);
        appModule.directive(AutoDisableOnRequest.id, [() => new AutoDisableOnRequest()]);



        appModule.config(['$httpProvider', ($httpProvider: ng.IHttpProvider) => {
            // $httpProvider.defaults.useXDomain = true    ;
            $httpProvider.interceptors.push(AuthInterceptor.id);
            $httpProvider.interceptors.push(SpinnerInterceptor.id);
            $httpProvider.interceptors.push(AutoDisableOnRequestInterceptor.id);
        }]);

        appModule.run(["$state", "$log", "$rootScope", "$location", "authService", "customerService", ($state:IStateService, logger:ILogService, $rootScope:IRootScopeService, $location:ILocationService, authService: AuthService, customerService: CustomerService) => {
            logger.debug("Bootstrapped the application...");

            logger.debug("Registered UI-router states: ");
            let index:number;
            let len:number;
            for (index = 0, len = $state.get().length; index < len; ++index) {
                const stateName:IState = $state.get()[index].name;
                const stateParent:IState = $state.get()[index].parent;
                const stateUrl:IState = $state.get()[index].url;
                // logger.debug(`State : ${stateName} [parent: ${stateParent}, url: ${stateUrl}]`);
            }

            $rootScope.$on("$stateChangeStart", function(event, toState, toParams, fromState, fromParams) {
                let loggedInUser : any = authService.employee;
                //redirect to login if requiredAuthentication is true(in case of internal urls) but no token is set
                if (toState != null && toState.access != null && toState.access.requiredAuthentication && !authService.isRemembered && !authService.isAuthenticated && !authService.tokenFromSession) {
                    event.preventDefault();
                    $state.go("login");
                }
                // setting fromState and fromParams in customer service for getting ids when redirecting from job to customer preference tab
                customerService.customersPref = {
                    "fromState" : fromState,
                    "fromParams" : fromParams
                }

                //redirect to urls based on conditions only if full url is not given (after login) and token is set
                if(toState != null &&  toState.url!=null && (toState.url=='/' || toState.url=='') && (authService.isRemembered || authService.isAuthenticated)){
                    $location.url("/");
                    // if (loggedInUser.acc_rgt.job == 1)
                    //     $location.url("/jobs");
                    // else if (loggedInUser.acc_rgt.acc == 1)
                    //     $location.url("/employee");
                    // else if (loggedInUser.acc_rgt.aff == 1)
                    //     $location.url("/supplier");
                    // else if (loggedInUser.acc_rgt.cust == 1)
                    //     $location.url("/customer");
                    // else if (loggedInUser.acc_rgt.rep == 1)
                    //     $location.url("/reports");
                    // else if (loggedInUser.acc_rgt.ques == 1)
                    //     $location.url("/questions");
                    // else if (loggedInUser.acc_rgt.panel == 1)
                    //     $location.url("/panel");
                    // else if (loggedInUser.acc_rgt.cmp == 1)
                    //     $location.url("/company");
                    // else if (loggedInUser.acc_rgt.tool == 1)
                    //     $location.url("/tools");
                }

                //Redirect to only Autheticated pages if user tries to access unautheticated files vial URL's
                if (loggedInUser != null) {
                    if (loggedInUser.acc_rgt.acc == 0 && $location['$$path']['indexOf']('/employee') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Employees');
                    }
                    else if (loggedInUser.acc_rgt.bid == 0 && $location['$$path']['indexOf']('/bids') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Bids');
                    }
                    else if (loggedInUser.acc_rgt.job == 0 && $location['$$path']['indexOf']('/jobs') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Jobs');
                    }
                    else if (loggedInUser.acc_rgt.aff == 0 && $location['$$path']['indexOf']('/supplier') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Suppliers');
                    }
                    else if (loggedInUser.acc_rgt.cust == 0 && $location['$$path']['indexOf']('/customer') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Customers');
                    }
                    else if (loggedInUser.acc_rgt.rep == 0 && $location['$$path']['indexOf']('/reports') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Reports');
                    }
                    else if (loggedInUser.acc_rgt.ques == 0 && $location['$$path']['indexOf']('/questions') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Questions');
                    }
                    else if (loggedInUser.acc_rgt.panel == 0 && $location['$$path']['indexOf']('/panel') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Panels');
                    }
                    else if (loggedInUser.acc_rgt.cmp == 0 && $location['$$path']['indexOf']('/company') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Companies');
                    }
                    else if (loggedInUser.acc_rgt.tool == 0 && $location['$$path']['indexOf']('/tools') > -1) {
                        authService.goToNextAuthenticatedPage();
                        $rootScope.$emit('event:empmessage', 'You Do Not Have Access To Tools');
                    }
                }
            });

        },]);

        angular.bootstrap(document, ["appModule"], {
            "strictDi": true,
        });
    }
}
