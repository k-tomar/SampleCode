"use strict";
import IStateService = angular.ui.IStateService;
import ILogService = angular.ILogService;
import {AbstractController} from "app/modules/commons/controllers/abstract.controller";
import { Config } from "app/app.config";
import { EmployeeService } from "./services/index";

export class EmployeeController extends AbstractController {
public static $inject: Array < string > = ["$log", "$state", "employeeService", "$timeout"];
    public config: any = new Config();
    public employee: any = [];
    public jobStatus: any = [];
    public employeeStatus: any;
    public prePayLoad: any = {};
    public employeeType: any = [];
    public isBusy : boolean = false;
    public timeout: any;
    private employeeService: EmployeeService;
    public sortField : any;
    public field:string = "Employee ID";
    public constructor(
        logger: ILogService,
        $state: IStateService,
        employeeService: EmployeeService,
        $timeout: ng.ITimeoutService
    ) {

        super(logger, $state, $timeout);
        this.prePayLoad["limit"] = 0;
        this.timeout = $timeout;
        this.employeeType = this.config.employeeType;
        this.employeeStatus = this.array_flip(this.config.status);
        this.employeeService = employeeService;
    }

    // function to add all emplyees based on pagination
    public getEmployee(prePayLoad : any) {
        let $this = this;
        prePayLoad["page"] = 1;
        $this.employeeService.getEmployees(prePayLoad).then((res: any) => {
            if(res.data && res.data.apiStatus == "success"){
                $this.isBusy = false;
                $this.employee = res.data.employees;
            }
        }, err => {
            this.showAlert(err.data.msg , {danger: true});
        });
    }

    public updateEmployeeStatus(emp : any){
        let $this = this;
        emp.status = (emp.status == this.employeeStatus['Active']) ? this.employeeStatus['InActive'] : this.employeeStatus['Active'];
        this.employeeService.updateEmployee(emp.id, {"status" : parseInt(emp.status)}).then((res : any) => {
            if(res.data && res.data.apiStatus == "success"){
                for ( let i in $this.employee){
                    if($this.employee[i].id === emp.id){
                        $this.employee[i].status = res.data.employee.status;
                    }
                }
            }
        }, err => {
            this.showAlert(err.data.msg , {danger: true});
        });
    }
    //function to sort according to sortField
    public sortEmployee(sortField:any){
         this.prePayLoad['sortField'] = sortField;
         this.getEmployee(this.prePayLoad);
    }

    /**
     * [getMoreEmployees description]
     */
    public getMoreEmployees() {
        if (this.isBusy || this.employee.length < this.prePayLoad["limit"]) return;
        this.isBusy = true;
        this.prePayLoad["limit"] += 15; // We will set limit 15 for every scroll call
        this.getEmployee(this.prePayLoad);
    }
}
