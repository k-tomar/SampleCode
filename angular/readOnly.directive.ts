import { AuthService } from "app/modules/commons/services/index";

export class ReadOnly implements ng.IDirective {
    public static id = "readOnly";
    
    public authService: any;
    public readOnly :any;

    constructor(authService: AuthService) {
        this.authService = authService;
    }

    public link(rootscope: ng.IRootScopeService, element: ng.IAugmentedJQuery, attributes: ng.IAttributes) {
        this.readOnly = this.authService.employee.acc_rgt["rd_oly"];
        if(this.readOnly){
            element.addClass('disabled')
            element.attr('ng-disabled', 'true')
            element.removeAttr('ng-click')
            element.removeAttr('href')
            element.removeAttr('ui-sref')
        }
    }
}
