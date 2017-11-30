import IHttpService = ng.IHttpService;
import { Config } from "app/app.config";
import { BaseApiService } from "../../commons/services/index";
import ILogService = angular.ILogService;

export class EmployeeService extends BaseApiService {
    static id = "employeeService";
    public static $inject: Array<string> = ["$http", "$log", "$mdToast"];
    public config:any = new Config();
    protected basePath: string;
    public defaultHeaders : any =  {"accept":"application/json"};
    constructor(
        protected $http: ng.IHttpService,
        protected logger:ILogService,
        protected $mdToast: ng.material.MDToastService)
    {
        super($http, logger, $mdToast);
        this.basePath = this.config.baseUrl;
    }


    /**
     * [getEmplyoees based on pagination description]
     * @param  {Groups}      model                  [description]
     * @param  {any}         extraHttpRequestParams [description]
     * @return {ng.IPromise}                        [description]
     */ 
    public getEmployees(payload: any, extraHttpRequestParams ? : any): ng.IPromise < any > {
        const localVarPath: string = this.basePath + "/employees";
        let headerParams: any = this.extendObj({}, this.defaultHeaders);
        let httpRequestParams: any = {
            method: 'POST',
            url: localVarPath,
            json: true,
            data: payload,
            headers: headerParams
        };
        if (extraHttpRequestParams) {
            httpRequestParams = this.extendObj(httpRequestParams, extraHttpRequestParams);
        }
        let params: any = [];
        return this.httpRequest("getEmployees", httpRequestParams, this.logger, params);
    };

    public getEmployeesData() :ng.IPromise < any > {
        return this.getAllEmployees().catch((err: any)=>this.handleError(err.data.msg));
    }

    /**
     * [getAllEmployees description]
     * @param  {Groups}      model                  [description]
     * @param  {any}         extraHttpRequestParams [description]
     * @return {ng.IPromise}                        [description]
     */
    public getAllEmployees( extraHttpRequestParams ? : any){
        const localVarPath: string = this.basePath + "/employee/emp";
        let headerParams: any = this.extendObj({}, this.defaultHeaders);
        let httpRequestParams: any = {
            method: 'GET',
            url: localVarPath,
            json: true,
            headers: headerParams
        };
        let params: any = [];
        return this.httpRequest("getAllEmployees",httpRequestParams, this.logger, params);   
    };    

    /**
     * [getEmployeeDetails based on employeeId description]
     * @param  {Groups}      model                  [description]
     * @param  {any}         extraHttpRequestParams [description]
     * @return {ng.IPromise}                        [description]
     */
    public getEmployeeDetails(empId: any, extraHttpRequestParams ? : any){
        const localVarPath: string = this.basePath + "/employee/" + empId;
        let headerParams: any = this.extendObj({}, this.defaultHeaders);
        let httpRequestParams: any = {
            method: 'GET',
            url: localVarPath,
            json: true,
            headers: headerParams
        };
        let params: any = [];
        return this.httpRequest("getEmployeeDetails",httpRequestParams, this.logger, params);
    };   

    /**
     * [updateEmployee based on employeeId description]
     * @param  {Groups}      model                  [description]
     * @param  {any}         extraHttpRequestParams [description]
     * @return {ng.IPromise}                        [description]
     */
    public updateEmployee(empId: any, data: any, extraHttpRequestParams ? : any){
        const localVarPath: string = this.basePath + "/employee/" + empId;
        let headerParams: any = this.extendObj({}, this.defaultHeaders);
        let httpRequestParams: any = {
            method: 'PUT',
            url: localVarPath,
            json: true,
            headers: headerParams,
            data: data,
        };
        let params: any = [];
        return this.httpRequest("updateEmployee",httpRequestParams, this.logger, params);   
    };    

    /**
     * [addEmployee description]
     * @param  {Groups}      model                  [description]
     * @param  {any}         extraHttpRequestParams [description]
     * @return {ng.IPromise}                        [description]
     */
    public addEmployee(data: any, extraHttpRequestParams ? : any){
        const localVarPath: string = this.basePath + "/employee";
        let headerParams: any = this.extendObj({}, this.defaultHeaders);
        let httpRequestParams: any = {
            method: 'POST',
            url: localVarPath,
            json: true,
            headers: headerParams,
            data: data,
        };
        let params: any = [];
        return this.httpRequest("addEmployee",httpRequestParams, this.logger, params);   
    };


}
