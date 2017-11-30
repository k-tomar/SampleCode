/*
 * Controller for the quotas collection objects
 * @module controllers/quotas
 */

var quotaModel = require('./../models/quotas');
var grpTrgModel = require('./../models/groupTargets');
var grpTrgStatsModel = require('./../models/groupTargetStats');
var empModel = require('./../models/employees');
var async = require('async');
var lib = require('./../lib/commonFunc');
var config = require('./../config/vars.js');
var dbConstants = require('./../config/db_constants');
var jobQueue = require('./../models/jobQueue');
var reqObj = require('./../lib/httpRequest');
var errors = require('common-errors');

//for reading csv file
var csv = require("fast-csv"),
    fs = require("graceful-fs"),
    path = require("path"),
    csvStream = csv.format({headers: true});

var AWS = require('aws-sdk');
AWS.config.loadFromPath(config.awsPath+'aws.json');

/**
 * This function get quotas for a group
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */

exports.getQuotas = function(req, res, next) {
    var limit, sort = null;
    var condition = {};
    if(req.params.grpId){
        condition["grpId"] = req.params.grpId;
    }            
        
    if(req.params.id){          
        condition["id"] = req.params.id;         
    }
    condition['cmpId'] = parseInt(req.user.cmp_id, 10);
    var selectparams = '';
    quotaModel.getQuotas(condition, selectparams, limit, sort, function(err, quotas) {    
        if(err){
            return res.status(400).json({ "apiStatus": "Failure", "msg": "Error while getting the quotas"});
        }
        else {
            if(quotas.length){
                for(var i = 0; i <= quotas.length-1; i++){
                    if(quotas[i].conditions && quotas[i].conditions.ZIPCODES){
                        quotas[i].conditions['ZIPCODES'] = "";
                    }
                }
            }
            return res.status(200).json({"apiStatus": "success", "msg": "quotas are successfully searched", "quotas": quotas});
        }
    });
};

/**
 * This function get quotas for a group
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */

exports.getGroupsWithQuota = function(req, res, next) {
    quotaModel.getGroupsWithQuota(parseInt(req.user.cmp_id, 10), function(err, grps) {   
        if(err){
            return res.status(400).json({ "apiStatus": "Failure", "msg": "Error while getting the quotas"});
        }
        else {
            return res.status(200).json({"apiStatus": "success", "msg": "Groups are successfully searched", "groups": grps});
        }
    });
};


/**
 * This function adds quota to group
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */

exports.addQuota = function(req, res, next) {
    if (!req.body.grpId || !req.body.title) {
        return res.status(400).json({"apiStatus": "Failure","msg": "Group Id or other info is missing"});
    }

    // if (!req.body.conditions) {
    //     return res.json(400, {"apiStatus": "Failure","msg": "Quota cannot be added without target conditions"});
    // }
    var data = req.body;
    async.waterfall([function (quotaCb) {
        if(data.conditions && data.conditions.ZIPCODES && data.conditions.ZIPCODES.length){
            grpTrgModel.getTargetOptions({'grp_num':data.grpId}, "ZIPCODES", function (err, groupTargets) {
                if(err){                    
                    quotaCb(true, 400, "Error while adding the Quota.");
                }
                else if(groupTargets && groupTargets.length > 0){
                    var quotaObj = compareZipcodesWithTargetZipcodes(groupTargets[0].ZIPCODES, data, data.conditions.ZIPCODES);
                    if(!quotaObj){
                        quotaCb(true, 404, "Zipcodes for this quota do not match with the targeting Zipcodes.");
                    }else{
                        quotaCb(null, quotaObj);                        
                    }
                }
            });
        }else{
            quotaCb(null, data);
        }
    }, function (createQuota, quotaCb) {
        createQuota['cmpId']  = createQuota.cmpId? createQuota.cmpId: parseInt(req.user.cmp_id, 10);
        quotaModel.createQuota(createQuota, function(err, quota) {
            if (err) {
                quotaCb(true, 400, "Error while adding the Quota");
            }else{
                if(quota.zipcode && quota.zipcode.file_nm){
                    var jQdata = {
                        "id": quota.id,
                        "job_type": dbConstants.jobQueueTypes.update_quota_zipcodes,
                        "retries": 0,
                        "status": dbConstants.jobQueue.gtrg_zip_code['pending']
                    };

                    jobQueue.addToJobQueue(jQdata, function (error, docs) {
                        if (error) {
                            next(new errors.HttpStatusError(400, {"apiStatus": "Failure", "msg": "Error while uploading file" }));
                            return;
                        } else {
                            var options = {};
                            options.method = 'GET';
                            options.host = config.rJobServer.host;
                            options.port = config.rJobServer.port;
                            reqObj.performRequest(config.version.v1 + 'jobserver/processjob/' + docs._id, options, {}, function (err, response, statusCode) {
                            });
                            quotaCb(null, 200, "Quota is successfully created.")
                        }
                    });                   
                }else{
                    quotaCb(null, 200, "Quota is successfully created.");
                }
            }
        });  
    }], function(err, statusCode, message){
            if(err){
                res.status(statusCode).json({ "apiStatus": "Failure", "msg": message});
            }else{
                res.status(statusCode).json({"apiStatus": "success", "msg": message});
            }
        }
    );
}

/**
 * This function delete quota from the group
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */
exports.deleteQuota = function(req, res, next) {
    var condition = {
        id: req.params.id,
        clk : 0 
    };

    quotaModel.deleteQuota(condition, function(err, quota) {
        if(err) {
            return res.status(400).json({"apiStatus": "Failure","msg": "Error while removing the Quota"});
        } else {
            return res.status(200).json({"apiStatus": "success", "msg": "Quota is successfully deleted"});
        }
    });
};
    
/**
 * This function delete quotas from the group
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */
exports.deleteQuotas = function(req, res, next) {
    var condition = {
        id: {
            $in : req.body.ids
        },
        clk : 0 
    };

    quotaModel.deleteQuota(condition, function(err, quota) {
        if(err) {
            return res.status(400).json({"apiStatus": "Failure","msg": "Error while removing the Quotas"});
        } else {
            return res.status(200).json({"apiStatus": "success", "msg": "Quotas is successfully deleted"});
        }
    });
};
    
/**
 * This function update quota to group
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */

exports.updateQuota = function(req, res, next) {
    var condition = {
        id: req.params.id
    };
   
    var data = req.body;
    if(data.quotaN) data.quotaN = parseInt(data.quotaN);
    
    //these props cant be updated directly
    if(data.lock) delete data.lock;
    if(data.crtd_on) delete data.crtd_on;
    if(data.mod_on) delete data.mod_on;
    if(data.clk) delete data.clk;
    if(data.cmp) delete data.cmp;
    if(data.fail) delete data.fail;
    if(data.oq) delete data.oq;
    if(data.qt) delete data.qt;

    if(!data.cmpId)
      data.cmpId = parseInt(req.user.cmp_id, 10);
    async.waterfall([function (cb) {
        if(data.conditions && data.conditions.ZIPCODES && data.conditions.ZIPCODES.length){
            grpTrgModel.getTargetOptions({'grp_num':data.grpId}, "ZIPCODES", function (err, groupTargets) {
                if(err){
                    cb(err);
                }
                else if(groupTargets && groupTargets.length > 0 && !(data.zipcode && data.zipcode.file_nm)){
                    var quotaObj = compareZipcodesWithTargetZipcodes((groupTargets[0].ZIPCODES || data.conditions.ZIPCODES), data, data.conditions.ZIPCODES);
                    if(!quotaObj){
                        cb(true, 404, "Zipcodes for this quota do not match with the targeting Zipcodes.");
                    }else{
                        cb(null, quotaObj);                        
                    }
                }else{
                    cb(null, data);
                }
            });
        }else{
            cb(null, data);
        }
    },function(updateQuota, cb){
        quotaModel.getQuota(condition, "", function (err, quota) {
            if (err) {
                return cb(true, 400, "Error, No quota found");
            }
            else{
                if(quota.st == dbConstants.quotaStatus['Invalid']){
                    updateQuota.st = dbConstants.quotaStatus['Invalid'];
                }else{
                    if(updateQuota.hardStop){
                        if(updateQuota.hardStopType == 1){
                            updateQuota.st = (Math.round(updateQuota.quotaN + ((updateQuota.quotaN * quota.hedge) / 100)) <= quota.clk) ? dbConstants.quotaStatus['Closed']: dbConstants.quotaStatus['Open'];
                        }
                        else{
                            updateQuota.st = (Math.round(updateQuota.quotaN + ((updateQuota.quotaN * quota.hedge) / 100)) <= quota.cmp) ? dbConstants.quotaStatus['Closed']: dbConstants.quotaStatus['Open'];
                        }
                    }
                    else{
                        updateQuota.st = dbConstants.quotaStatus['Open'];
                    }
                }
                if(updateQuota.conditions && updateQuota.conditions.ZIPCODES == ""){
                    updateQuota.conditions['ZIPCODES'] = quota.conditions['ZIPCODES'];
                }
                cb(null,updateQuota);
            }
        });
    }, function (updateQuota, cb) {
        var options = {};
        quotaModel.updateQuota(condition, updateQuota, options, function (err, UpdatedQuota) {
            if (err) {
                cb(true, 400, "Error, No quota found");
            }else{
                if(updateQuota.quotaN && updateQuota.zipcode && updateQuota.zipcode.file_nm && !updateQuota.zipcode.file_st){
                    var jQdata = {
                        "id": updateQuota.id,
                        "job_type": dbConstants.jobQueueTypes.update_quota_zipcodes,
                        "retries": 0,
                        "status": dbConstants.jobQueue.gtrg_zip_code['pending']
                    };
                    jobQueue.addToJobQueue(jQdata, function (error, docs) {
                        if (error) {
                            next(new errors.HttpStatusError(400, {"apiStatus": "Failure", "msg": "Error while uploading file" }));
                            return;
                        } else {
                            var options = {};
                            options.method = 'GET';
                            options.host = config.rJobServer.host;
                            options.port = config.rJobServer.port;
                            reqObj.performRequest(config.version.v1 + 'jobserver/processjob/' + docs._id, options, {}, function (err, response, statusCode) {
                            });
                            cb(null, 200, "Quota is successfully updated.");
                        }
                    });
                }
                else{
                    cb(null, 200, "Quota is successfully updated.");
                }
            }
        });
    }], function(err, statusCode, message){
        if(err){
            return res.status(statusCode).json({ "apiStatus": "Failure", "msg": message});
        }else{
            return res.status(statusCode).json({"apiStatus": "success", "msg": message});
        }
    })
};

/**
 * This function update QuotaData Called from uploadQuotaZip
 */
function compareZipcodesWithTargetZipcodes (groupTargetZipCodes, quotaData, quotazipCodes) {
    var zipArr = [], title = "", targetZipCodes = {}, dupObj={};

    groupTargetZipCodes.map(function (opt) {
        targetZipCodes[opt.opt_txt || opt.OptionText] = opt;
    });

    quotazipCodes.forEach(function (z) {
        if(targetZipCodes[z] && !dupObj[targetZipCodes[z].opt_id]){
            dupObj[targetZipCodes[z].opt_id] = true;
            zipArr.push({
                OptionId: targetZipCodes[z].opt_id || targetZipCodes[z].OptionId,
                OptionText: targetZipCodes[z].opt_txt || targetZipCodes[z].OptionText
            });
        }
    });

    if(zipArr.length > 0) {
        quotaData.conditions['ZIPCODES'] = zipArr;
        if(!quotaData.zipcode){
            quotaData.zipcode = {};
        }
        quotaData.zipcode['count'] = zipArr.length;

        return quotaData;
    }
    else
        return false;
}

/**
 * This function update Zipcodes from CSV  in Quota
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */
exports.uploadQuotaZip = function (req, res, next) {
    if(req.file.originalname.substr(-4).toLowerCase() != ".csv"){
        lib.fileDelete(req.file);
        next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "File format is invalid"}));
        return;
    }
    var caseRegex = /\b(zipcodes)/i, numRegex = /([a-zA-Z])+/g;
    //Upload file to AWS server
    var params;
    var s3 = new AWS.S3();
    var fullFileName = req.file.filename + ".csv";
    fs.readFile(req.file.path, function (err, fileBuffer) {
        if (fileBuffer) {
            var zipCodeArray = fileBuffer.toString().split(/\r?\n/).filter(Boolean);
            if(zipCodeArray.length === 0){
                // check zipcode file for data if file have newline but no zipcode in file or empty file
                next(new errors.HttpStatusError(400, {"apiStatus": "Failure", "msg": "Empty file, Please check your File Data" }));
            }else if(!(caseRegex.exec(fileBuffer.toString()) != null || numRegex.exec(fileBuffer.toString()) == null)){
                next(new errors.HttpStatusError(400, {"apiStatus": "Failure", "msg": "Invalid file, Please check your File Data" }));
            }else{
                var unique = {};
                var resultZip = [];
                for( var i in zipCodeArray ){
                    if( typeof(unique[zipCodeArray[i]]) == "undefined"){
                        unique[zipCodeArray[i]] = true;
                        resultZip.push(zipCodeArray[i]);
                    }
                }
                uniqueZipcodes = resultZip.join('\n');
                params = {
                    Bucket: config.bucket,
                    Key: fullFileName,
                    Body: uniqueZipcodes
                };
                s3.putObject(params, function (error, response) {
                    if(error){
                        console.log('error', error)
                        next(new errors.HttpStatusError(400, {"apiStatus": "Failure", "msg": "Could not read file" }));
                    }
                    else{
                        res.status(200).json({"apiStatus": "Success", "fileName" : fullFileName});
                    }
                })
            }
        }else{
            console.log("cannot read file " + err);
            next(new errors.HttpStatusError(400, {"apiStatus": "Failure", "msg": "Could not read file" }));
        }
    });
};


/**
 * This function update quotas lock in bulk
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */

exports.updateQuotasLock = function(req, res, next) {
    var condition = {
        id: { $in: req.body.ids}
    };
    var data = {lock : req.body.lock};

    var options = {multi: true};
    quotaModel.updateQuota(condition, data, options, function (err, UpdatedQuota) {
        if (err) {
            return res.status(400).json({"apiStatus": "Failure", "msg": "Error, No quota found"});
        }
        return res.status(200).json({"apiStatus": "success", "msg": "Quotas' lock is successfully updated"});
    });
};

/**
 * This function update quotas lock in bulk
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */

exports.duplicateQuotas = function(req, res, next) {
    var cmpId = parseInt(req.user.cmp_id, 10);
    var limit, sort = null;
    var condition = {
        id: { $in: req.body.ids}
    };
    var selectparams = "-_id grpId grpName jobId quotaName title conditions quotaN hedge hardStop hardStopType cmpId";
    quotaModel.getQuotas(condition, selectparams, limit, sort, function(err, quotas) {    
        if(err){
            return res.status(400).json({"apiStatus": "Failure", "msg": "Error in duplicating quotas"});
        }
        else {
            if (quotas.length > 0) {
                async.eachSeries(quotas, function (quota, nextQuota) {
                    quota.quotaName = "Copy of " + (quota.quotaName ? quota.quotaName : quota.title);
                    quota.cmpId = quota.cmpId ? quota.cmpId : cmpId;
                    quotaModel.createQuota(quota, function(err, data) {
                        if (err) 
                            nextQuota(err);
                        else
                            nextQuota();
                    });
                }, function (err) {
                    if (err) {
                        console.log("Error in duplicating quotas", err);
                        return res.status(400).json({"apiStatus": "Failure", "msg": "Error in duplicating quotas"});
                    }
                    return res.status(200).json({"apiStatus": "success", "msg": "Quotas has been duplicated successfully"});
                    
                });
            }
            else {
                return res.status(400).json({"apiStatus": "Failure", "msg": "Error, No quota found to duplicate"});
            }
        }

    });
};

/**
 * This function imports targeting and quotas from a selected group
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */

exports.importQuotas = function(req, res, next) {
    var limit, sort = null;
    var grpId = req.params.grpId;
    if (!req.body.grpId) {
        return res.status(400).json({"apiStatus": "Failure", "msg": "Source group id is missing"});
    }

    var srcGrpId = req.body.grpId;
    var srcGrpName = req.body.grpName;
    var srcJobId = req.body.jobId;

    async.waterfall([function (cb) {
        grpTrgModel.copyAllTargets(srcGrpId, grpId, function (err, trg) {
            if (err) {
                console.log("Error in import targeting from another group", err);
                return res.status(400).json({"apiStatus": "Failure", "msg": "Error in import targeting from another group"});
            }
            cb(null);
        }); 
    },
    function (cb) {
        grpTrgStatsModel.getTargetStat({grp_num: srcGrpId}, "", null, "", function (error, targets) {
            if (error) {
                console.log("Error in import targeting from another group", error);
                return res.status(400).json({"apiStatus": "Failure", "msg": "Error in import targeting from another group"});            
            }
            cb(null, targets);
        });
    },
    function (targets, cb) {
        if (targets.length > 0) {
            var target = targets[0];
            var trgData = {};
            for(key in target) {
                if(target[key] instanceof Array && Array.isArray(target[key]) && target[key] !== undefined) {
                    trgData[key] = target[key];
                    target[key].forEach(function(single_option,index){
                        trgData[key][index]['PID'] = [];
                        trgData[key][index]['clks'] = 0;
                        trgData[key][index]['cmps'] = 0;
                    });
                }
            }
            grpTrgStatsModel.updateTargetStat({grp_num: grpId}, trgData, {}, function(err, trg){
                if (err) {
                    console.log("Error:", err);
                    return res.status(400).json({ "apiStatus": "Failure", "msg": "Error while updating/adding the Group Target"});
                };
                cb(null);
            });
        }
        else 
            cb(null);  
    },
    function (cb) {
        var condition = {
            grpId: srcGrpId,
            st: {$in:[dbConstants.quotaStatus['Closed'], dbConstants.quotaStatus['Open']]}
        };
        var selectparams = "-_id quotaName title conditions quotaN hedge hardStop hardStopType cmpId";
        quotaModel.getQuotas(condition, selectparams, limit, sort, function(err, quotas) {    
            if(err){
                return res.status(400).json({"apiStatus": "Failure", "msg": "Error in importing quotas"});
            }
            else {
                if (quotas.length > 0) {
                    async.eachSeries(quotas, function (quota, nextQuota) {
                        quota.grpId = grpId;
                        quota.grpName = srcGrpName;
                        quota.jobId = srcJobId;
                        quota.cmpId = quota.cmpId? quota.cmpId: parseInt(req.user.cmp_id, 10); 
                        quotaModel.createQuota(quota, function(err, data) {
                            if (err) 
                                nextQuota(err);
                            else
                                nextQuota();
                        });
                    }, function (err) {
                        if (err) {
                            console.log("Error in importing quotas", err);
                            return res.status(400).json({"apiStatus": "Failure", "msg": "Error in importing quotas"});
                        }
                        cb(null);
                    });
                }
                else {
                    return res.status(400).json({"apiStatus": "Failure", "msg": "Error, No quota found to import"});
                }
            }
        });
    }], function (err, results) {
        return res.status(200).json({"apiStatus": "success", "msg": "Quotas has been imported successfully"});
    });
};

/**
 * This function downloads the zipcode file
 * @param req {Object} the request object
 * @param res {Object} the response object
 * @param next {Object} the error object
 */
exports.downloadQuotaZipCodes = function (req, res, next) {
    var id =  req.params.id;
    var fileName = "uploaded_zipcodes_" + id + ".csv";
    var data = new Array();
    quotaModel.getQuota({id: id}, '', function (e, quota) {
        if (e) {
            console.log("Error:", e);
            next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "Error while fetching zipcodes from quota"}));
        }
        else if(quota && quota.conditions && quota.conditions.ZIPCODES){
            data.push(["ZIPCODES"]);
            if(quota.zipcode && quota.zipcode.file_nm){
                fileName = quota.zipcode.file_nm;
            }
            var zipcodes = quota.conditions.ZIPCODES;
            async.eachSeries(zipcodes, function(zipcode, cb){
                data.push([zipcode.OptionText]);
                setImmediate(cb);
            }, function(err) {
                csv.writeToStream(fs.createWriteStream(config.DOWNLOADS + fileName), data, {headers: true}).on("finish", function(){
                    var file = config.DOWNLOADS + fileName;
                    res.download(file);
                });
            });
        }else {
            next(new errors.HttpStatusError(400, { "apiStatus": "Failure", "msg": "No zipcodes found in quota"}));
        }
    });
};