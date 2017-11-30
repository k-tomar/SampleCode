/*
 * Controller for the questions collection objects
 * @module controllers/questions
 */

var questionsModel = require('./../models/questions');
var jobStatsModel = require('./../models/jobStats');
var jobTransModel = require('./../models/jobTransactions');
var quotaModel = require('./../models/quotas');
var jobModel = require('./../models/jobs');
var grpModel = require('./../models/groups');
var supModel = require('./../models/suppliers');
var memIdTans = require("./../models/memberIdTransactions");
var masterModel = require('./../models/masterData');
var grpTrgModel = require('./../models/groupTargets');
var companyModel = require('./../models/company');
var verifiedTknModel = require('../models/verifiedTokenJobStats');

var lib = require('./../lib/commonFunc');
var config = require('./../config/vars.js');
var errors = require('common-errors');
var async = require('async');
var dbConstants = require('./../config/db_constants');
var moment = require('moment');


/**
 * This function gets list of all questions by country
 * Content-Type application
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */
exports.getQuestionsByCategory = function(req, res, next) {
    var country = dbConstants.countryShortCode;      //setting default to US(for safe side) but it will not be needed as this function will always be called only if country is provided.

    if(req.params.country){
        country = req.params.country;
    }

    var cond = {};
    // get question categories for US and non US countries
    async.waterfall([
        function(callback) {
            if(country == dbConstants.countryShortCode){
                cond = {'country' : country}
            }
            masterModel.getCategoryByCond(cond, "id category language", null, {}, function (err, qstnCategories) {
                if(err){
                    console.log("Error while fetching category for this Country: " + country);
                    next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching category for this Country."}));
                }else {
                    if (qstnCategories && qstnCategories.length > 0){
                        callback(null, qstnCategories)
                    }
                    else{
                        console.log("No questions for category "+ qstnCategories);
                        next(new errors.HttpStatusError(404, { "apiStatus": "Failure", "msg": "No Data Found "}));
                    }
                }
            });
        },
        // function to call questions according to categoryId for US and questionKey for non US countries
        function(categoryDetails, callback){
            var condition = {};
            var catName = [];
            var language = [];
            var categoryIds = [];
            // to get category name, language according to category-id
            for (var i = categoryDetails.length - 1; i >= 0; i--){
                catName[categoryDetails[i].id] =  categoryDetails[i].category;
                language[categoryDetails[i].id] =  categoryDetails[i].language;
                if(country == dbConstants.countryShortCode){
                    categoryIds.push(categoryDetails[i].id);
                }
            }
            var qstnKeyArray = ['AGE', 'GENDER', 'EMPLOYMENT', 'RELATIONSHIP', 'PARENTAL_STATUS', 'INDUSTRY', 'JOB_TITLE', 'STANDARD_ELECTRONICS', 'STANDARD_COMPANY_DEPARTMENT', 'STANDARD_GAMING_DEVICE', 'STANDARD_COMPANY_REVENUE', 'STANDARD_B2B_DECISION_MAKER', 'STANDARD_HOUSEHOLD_TYPE', 'STANDARD_No_OF_EMPLOYEES'];
            if(config.categoryObj.hasOwnProperty(country)){//category matched
                categoryIds.push(config.categoryObj[country]);
            }
            condition['$or'] = [{"Category": {$in: categoryIds}}, {"QuestionKey": {$in: qstnKeyArray}}];
            questionsModel.getQuestions(condition, "QuestionKey QuestionText QuestionType Category", null, {}, function(err, questions) {
                if(err){
                    console.log("Error fetching questions for category id " + categoryIds);
                    callback(err, null)
                }
                else{
                    if(questions && questions.length > 0) {
                        // add category name and language fields
                        questions.map(function(qusObj){
                            qusObj['language'] = language[qusObj.Category];
                            qusObj['Category'] = catName[qusObj.Category];
                            return qusObj;
                        })
                    }
                    callback(null, questions)
                }
            });
        },
    ],function(err, questions){
        if (err){
            console.log("No data found for this Country: " + country);
            next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching questions "}));
        } else{
            //Return final success data
            return res.status(200).json({
                "apiStatus": "success",
                "msg": "questions are successfully searched",
                "result": questions
            });
        }
    });
};


/**
 * This function get answerList corresponding to questionsId
 * Content-Type application
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */
exports.getAnswersByQuesKey = function (req, res, next) {
    questionsModel.findQuestionByQuestionID({QuestionKey:req.params.quesKey}, 'QuestionText QuestionType QuestionOptions.OptionText QuestionOptions.id', function (err, doc) {
        if(err){
            console.log("Error while fetching data for QuestionKey: " + req.params.quesKey);
            next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching data for QuestionKey"}));
        }else{    
            if(doc){     
                return res.status(200).json({
                    "apiStatus": "success",
                    "msg": "Answers are successfully searched",
                    "result": doc
                });
            }else{
                console.log("No data found for QuestionKey: " + req.params.quesKey);
                next(new errors.HttpStatusError(404, { "apiStatus": "Failure", "msg": "No data found"}));
            }
        }
    });
};

exports.getAllocatedSurveysV2 = function (req, res, next) {
    var supId = req.user.usr_id;
    var jobIds = [];
    var surveyIds = [];
    var filteredGroupIds = [], groupIndexes = {};
    jobStatsModel.getGroupsBySupId(supId, function(err, groups){
        if(err){
            console.log("Error while fetching live groups for Supplier: " + err);
            next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching live groups for Supplier "+supId}));
        }else{
            if(groups && groups.length > 0){
                async.parallel({
                    setGroups: function (cb) {
                        groupIndexes = groups.reduce(function(ac, c, i){
                            if(jobIds.indexOf(c.id) == -1) {
                                jobIds.push(c.id);
                            }
                            ac[c.surveyId] = i;
                            return ac;
                        }, {});
                        surveyIds = Object.keys(groupIndexes);
                        cb();
                    },
                    languages: function (cb) {
                        var langList = {};
                        masterModel.getLanguages(function (err, langs) {
                            if(err){
                                console.log("Error while fetching all language names ", err);
                                next(new errors.HttpStatusError(400,{ "apiStatus": "Failure", "msg": "Error fetching languages list"}));
                            } else {
                                if (langs && langs.length > 0) {
                                    langList = langs.reduce(function (list, lng, i) {
                                        list[lng.id] = lng.name;
                                        return list;
                                    }, {});
                                } else {
                                    console.log("Error while fetching all language names")
                                }
                                cb(null, langList);
                            }
                        });
                    }, 
                    categories: function (cb) {
                        var categories = {};
                        masterModel.getCategoryByCond({}, "id category -_id", null, {}, function (err, catDetails) {
                            if(err){
                                console.log("Error while fetching all categories name ",err);
                                next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching all categories name "}));
                            }else{
                                if (catDetails && catDetails.length > 0) {
                                    categories = catDetails.reduce(function (list, cat, i) {
                                        list[cat.id] = cat.category;
                                        return list;
                                    }, {});
                                } else {
                                    console.log("Error while fetching all category names")
                                } 
                                cb(null, categories);                                       
                            }
                        });  
                    }, 
                    jobCategories: function (cb) {
                        var jobCategories = {};
                        masterModel.getCategories(function (err, jobCats) {
                            if(err){
                                console.log("Error while fetching all job_categories name ",err);
                                next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching all job_categories name "}));
                            }else{
                                if (jobCats && jobCats.length > 0) {
                                    jobCategories = jobCats.reduce(function (list, cat, i) {
                                        list[cat.id] = cat.name;
                                        return list;
                                    }, {});
                                } else {
                                    console.log("Error while fetching all category names")
                                } 
                                cb(null, jobCategories);                                       
                            }
                        });  
                    },
                    supplierDetail: function (cb) {
                        supModel.getSupplierDetailsBySupId(supId, function (supErr, supp) {
                            if(supErr){
                                console.log("Error while fetching supplier details ",supErr);
                                next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching supplier details "}));
                            }else{
                                var cap_amount = (supp.cmsn.cap_amt) ? supp.cmsn.cap_amt : 0;
                                var adminFee = 0;
                                var isSNSup = 0;
                                if(supp.isAPI == 1 && supp.id != config.inboxSupId){
                                    isSNSup = 1;
                                }
                                if(supp.cmsn.isAdFee == 1){    // is admin fee on
                                    // getting admin fee value from company collection
                                    var condition = {"id": parseInt(supp.cmp_id)};
                                    companyModel.getCompanyData(condition, 'gSettings.adm_fee', function(err, docs){
                                        if(err) {
                                            console.log("Error while fetching company details ",err);
                                            return next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching company details "}));
                                        } else if(docs && docs.gSettings.adm_fee) {
                                            adminFee = docs.gSettings.adm_fee;
                                        }
                                        cb(null, {adminFee: adminFee, cap_amount:cap_amount, isSNSup: isSNSup});
                                    });
                                }
                                else{    // is admin fee off
                                    cb(null, {adminFee: adminFee, cap_amount:cap_amount, isSNSup: isSNSup});
                                }
                            }
                        });
                    }
                }, function (err, results) {
                    if (err) {
                        console.log("Error ", err);
                        return next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching available surveys", "Error": err}));                        
                    }
                    var calculateCPI = function (grp, grpCPI, sup) {
                        if(grp.isRevShr == false && grp.supCPI >= 0){     // it means, Flat rate is on with some value
                            return grp.supCPI.toFixed(2);
                        }
                        else{
                            var cpiAfterAdminFee = grpCPI;
                            if(sup.adminFee > 0) {
                                cpiAfterAdminFee = (grpCPI - ((sup.adminFee/100) * grpCPI));
                            }
                            var cpiAfterRevShr = (grp.supCPI/100)* cpiAfterAdminFee;
                            
                            var CPI = cpiAfterRevShr.toFixed(2);
                            if(sup.cap_amount && cpiAfterRevShr > sup.cap_amount){
                                CPI = sup.cap_amount.toFixed(2);
                            }
                            return CPI;
                        }                                    
                    }
                    async.waterfall([function(cb){
                        var totalSNCmps = {};
                        //To get Sample Network complete ADMIN-1056
                        if(results.supplierDetail.isSNSup){
                            var grpIdsArr =  surveyIds.map(function (x) {
                                return parseInt(x, 10);
                            });
                            jobStatsModel.getGroupStatsByGrpIdsAndSupId(grpIdsArr, supId, function(err, groupStats){
                                if(err){
                                    console.log("No matching group found in job stats table", err);
                                    next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching job stats details"}));
                                }else{
                                    async.eachSeries(groupStats, function(grpData, nextGrp){
                                        totalSNCmps[grpData.groups.grp_id] = 0;
                                        if (grpData.groups.sup && grpData.groups.sup.length) {
                                            grpData.groups.sup.map(function (sup_id){
                                                if(grpData.groups["sup"+sup_id].isFulcrum == 3 && sup_id != config.inboxSupId){
                                                    totalSNCmps[grpData.groups.grp_id] += grpData.groups["sup"+sup_id].cmps;
                                                }
                                            });
                                        }
                                        nextGrp();
                                    }, function(err){
                                        cb(null, totalSNCmps);
                                    });
                                }
                            });
                        }else{
                            cb(null, totalSNCmps);
                        }
                    },function (totalSNCmps, cb) {
                        var filteredGroups = [], grpIds = {};
                        var condition = {id: {$in: surveyIds}};
                        var datetimeCond = {}, innovateSupCond = {};
                        if (req.params.datetime) {
                            datetimeCond["$or"] = [{"crtd_on": { $gt: lib.PSTtoGMT(new Date(req.params.datetime))}}, {"mod_on": { $gt: new Date(req.params.datetime)}}];
                        }
                        innovateSupCond["$or"] = [{"is_inn_sup": 1, "isPega": 1}, {"isPega": 0}, {"isPega": {$exists: false}}]; //When group achieved soft launch and innovate supply is OFF then we should not show that survey in getAllocatedSurveys API.
                        condition['$and'] = [datetimeCond, innovateSupCond];

                        grpModel.getGroupByCondition(condition, "id CPI IR survNum grp_num_enc LOI trg dvc crtd_on mod_on mem_chk grp_typ gtrg testUrl", function (error, docs) {
                            if(error){
                                console.log("Error while fetching groups details ", error);
                                return next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching groups details", "Error": error}));
                            }else{
                                if (docs && docs.length) {
                                    async.forEach(docs, function (grp, nextGrp) {
                                        if (groups[groupIndexes[grp.id]]) {
                                            groups[groupIndexes[grp.id]].remainingN = groups[groupIndexes[grp.id]].N - (results.supplierDetail.isSNSup ? totalSNCmps[grp.id] : groups[groupIndexes[grp.id]].supCmps);
                                            groups[groupIndexes[grp.id]].grpCPI = grp.CPI;
                                            groups[groupIndexes[grp.id]].LOI = grp.LOI;
                                            groups[groupIndexes[grp.id]].IR = grp.IR;
                                            groups[groupIndexes[grp.id]].Country = grp.trg.cnt;
                                            groups[groupIndexes[grp.id]].Language = results.languages[grp.trg.lng[0]];
                                            groups[groupIndexes[grp.id]].groupType = ((grp.grp_typ != undefined) && (grp.grp_typ != null)) ? dbConstants.groupType[grp.grp_typ] : "";
                                            groups[groupIndexes[grp.id]].deviceType = dbConstants.groupDevice[grp.dvc]? dbConstants.groupDevice[grp.dvc]: dbConstants.groupDevice[6];
                                            if(grp.crtd_on){
                                                groups[groupIndexes[grp.id]].createdDate = lib.GMTtoPST(grp.crtd_on);
                                            }if(grp.mod_on){
                                                groups[groupIndexes[grp.id]].modifiedDate = lib.GMTtoPST(grp.mod_on);
                                            }
                                            groups[groupIndexes[grp.id]].reContact = (grp.mem_chk) ? true : false;
                                            groups[groupIndexes[grp.id]].entryLink = config.surveyUrl+"/startSurvey?survNum=" + grp.grp_num_enc + "&supCode=" + supId + "&PID=[%%pid%%]";
                                            groups[groupIndexes[grp.id]].testEntryLink = grp.testUrl ? (config.surveyUrl+"/startSurvey?Test=1&NotLive=1&survNum=" + grp.grp_num_enc + "&supCode=" + supId + "&PID=[%%pid%%]") : "";
                                            groups[groupIndexes[grp.id]].targeting = grp.gtrg;
                                            groups[groupIndexes[grp.id]].CPI = calculateCPI(groups[groupIndexes[grp.id]], grp.CPI, results.supplierDetail);

                                            grpIds[grp.id] = filteredGroups.length;
                                            filteredGroups.push(groups[groupIndexes[grp.id]]); // It will be used for further processing instead of groups
                                        }
                                        nextGrp();
                                    }, function (err) {
                                        cb(null, filteredGroups, grpIds);
                                    });
                                } else {
                                    console.log("No data found for Groups: " + Object.keys(groupIndexes) + " -->Reason:- surveyId could be wrong or no data in DB related to this survey");
                                    cb(null);
                                }
                            }
                        });
                        
                    }], function (err, filteredGroups, grpIds) {
                        if (err) {
                            console.log("Error ", err);
                            return next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while setting up available surveys properties", "Error": err}));                        
                        }
                        if (filteredGroups && filteredGroups.length) {
                            surveyIds = Object.keys(grpIds).map(Number);
                            async.parallel([function (callback) {
                                // set job category
                                var cond = {id: {$in: jobIds}};
                                jobModel.getJobDetailsByCond(cond, 'ct id -_id', function (error, jobs) {
                                    if(error){
                                        console.log("Error while fetching job_category details ",error);
                                        return next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching job details", "Error": error}));
                                    }else{                                        
                                        if (jobs && jobs.length) {
                                            for(var j = jobs.length-1; j >= 0; j--){ 
                                                filteredGroups.map(function(obj){                                                   
                                                    if(obj != undefined && obj.id == jobs[j].id){                                        
                                                        obj.jobCategory = results.jobCategories[jobs[j].ct];
                                                        delete obj.id;  // removing id from final response
                                                        delete obj.supCPI;
                                                        delete obj.grpCPI;
                                                    }
                                                });
                                            }
                                            callback();
                                        }
                                        else {
                                            console.log("No data found for Groups: " + surveyIds + " -->Reason:- surveyId could be wrong or no data in DB related to this survey");
                                            callback();
                                        }
                                    }
                                });
                            }, function (callback) {
                                // setup targeting
                                grpTrgModel.getTargetOptions({grp_num:{$in: surveyIds}}, {}, function (error, grpTrgs) {
                                    if(error) {
                                        console.log("Error while fetching group targeting details ", error);
                                        return next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching survey questions", "Error": error}));
                                    }
                                    else if(grpTrgs && grpTrgs.length) { 
                                        //Get targeting question with their options
                                        async.eachSeries(grpTrgs, function (grpTrg, nextGrp) { 
                                            var targets = [];
                                            if (filteredGroups[grpIds[grpTrg.grp_num]] && filteredGroups[grpIds[grpTrg.grp_num]].targeting) {
                                                async.eachSeries(filteredGroups[grpIds[grpTrg.grp_num]].targeting, function (ques, nextQues) { 
                                                    var quesDetails = {};
                                                    quesDetails["QuestionKey"] = ques.q_key;
                                                    quesDetails["QuestionText"] = ques.q_txt;
                                                    quesDetails["QuestionType"] = ques.q_type;
                                                    quesDetails["QuestionCategory"] = results.categories[ques.q_cat];
                                                    quesDetails.Options = [];
                                                    if(grpTrg && grpTrg[ques.q_key] != undefined){
                                                        var quesOptions = grpTrg[ques.q_key];
                                                        for (var opt = 0; opt <= quesOptions.length-1; opt++){
                                                            if(ques.q_key == 'AGE'){
                                                                quesDetails.Options.push({
                                                                    OptionId : quesOptions[opt].opt_id,
                                                                    ageStart : quesOptions[opt].startAge,
                                                                    ageEnd : quesOptions[opt].endAge,
                                                                });
                                                            }else{
                                                                if(!quesOptions[opt].termOpts){
                                                                    quesDetails.Options.push({
                                                                        OptionId : quesOptions[opt].opt_id,
                                                                        OptionText : quesOptions[opt].opt_txt
                                                                    });
                                                                }
                                                            }
                                                        }
                                                    }
                                                    if(quesDetails.Options.length)
                                                        targets.push(quesDetails);

                                                    nextQues();
                                                }, function (err) {
                                                    // No error will be here
                                                    filteredGroups[grpIds[grpTrg.grp_num]].targeting = targets;
                                                    nextGrp();
                                                });
                                            }
                                            else {
                                                nextGrp();
                                            }
                                        }, function (err) {
                                            // No error will be here
                                            callback();                                    
                                        });
                                    }
                                    else {
                                        filteredGroups.map(function(group) {
                                            group.targeting = [];
                                        });
                                        console.log("No data found for Groups: " + surveyIds + " -->Reason:- surveyIds could be wrong or no data in DB related to this survey");
                                        callback();
                                    }  
                                });
                            }, function (callback) {
                                // setup quota
                                quotaModel.getQuotasGroupId({$in: surveyIds}, function(err, quotas){
                                    if(err){
                                        console.log("Error while fetching surveyIds which have Quotas",err);
                                        next(new errors.HttpStatusError(400, {
                                            "apiStatus": "Failure",
                                            "msg": "Error while getting list of all live groups associated to suppliers "
                                        }));
                                    }else {
                                        // compare and map isQuota flag true/false in response object which survey ids have quotas or not 
                                        filteredGroups.map(function(grpObj){
                                            if(quotas && quotas.length && quotas[0].surveyIds.indexOf(grpObj.surveyId) > -1){
                                                grpObj['isQuota'] = true;
                                            }
                                            else{
                                                grpObj['isQuota'] = false;
                                            }
                                        });
                                        callback();
                                    }
                                });
                            }], function (err) {
                                if (err) {
                                    console.log("Error", err);
                                    next(new errors.HttpStatusError(400, {
                                        "apiStatus": "Failure",
                                        "msg": "Error while getting list of all live groups associated to suppliers "
                                    }));                                
                                }
                                else {
                                    // send response
                                    return res.status(200).json({
                                            "apiStatus": "success",
                                            "msg": " All live groups are successfully searched",
                                            "result": filteredGroups
                                        });
                                }
                            });
                        }
                        else {
                            next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "No surveys available"}));
                        }
                    });

                });
            }
            else { 
                console.log("No data found for Supplier: " + supId + " -->Reason:- surveyId could be wrong or no groups found in DB assigned to Supplier");
                next(new errors.HttpStatusError(404, { "apiStatus": "Failure", "msg": "No surveys available"}));
            }
        }
    })
}
