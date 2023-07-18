const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const router = express.Router();
const UsersDatabase = require("../MongooseModel/Users.js");
const BusinessesDatabase = require("../MongooseModel/Businesses.js");
const { check, validationResult } = require("express-validator");
const getCoorForAddress = require("../GoogleMap.js");
const multer = require("../MulterMiddleWare.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const validateAuthToken = require("../authMiddleware.js");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4 } = require('uuid');

const bucketName = process.env.BUCKET_NAME;
const accessKey = process.env.ACCESS_KEY;
const bucketRegion = process.env.BUCKET_REGION;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
    credentials:{
        accessKeyId : accessKey,
        secretAccessKey : secretAccessKey
    },
    region: bucketRegion
});

router.post("/auth/:entity/register",[
    check("username").isLength({min : 8}),
    check("password").isLength({min : 8}),
    check("email").normalizeEmail().isEmail()
],async function(req,res,next) {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return next(new Error("invalid email address, please try again!"));
    };
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    if (req.params.entity === "users") {
        let userExist;
        try {
            userExist = await UsersDatabase.Users.find({email : email});
            if (userExist.length) {
                return next(new Error("This Email already has an Account!"));
            } else {
                let hashedPassword;
                try {
                    hashedPassword = await bcrypt.hash(password, 12);
                } catch (err) {
                    return next(new Error("Unknown error occurred, please register again!"));
                };
                const newUser = UsersDatabase.Users({
                    username : username,
                    password : hashedPassword,
                    email : email,
                });
                await newUser.save();
                return res.json({message : "Registration successful! Please proceed to login."});
            }
        } catch (err) {
            return next(new Error("An error occurred while register, please try again!").status(404));
        };
    } else if (req.params.entity === "businesses") {
        let businessExist;
        try {
            businessExist = await BusinessesDatabase.Businesses.find({email : email});
            if (businessExist.length) {
                return next(new Error("This Email already has an Account!").status(400));
            } else {
                let hashedPassword;
                try {
                    hashedPassword = await bcrypt.hash(password, 12);
                } catch (err) {
                    return next(new Error("Unknown Error Occurred, Please try again!"));
                };
                const newBusiness = new BusinessesDatabase.Businesses({
                    companyName : username,
                    password : hashedPassword,
                    email : email,
                });
                await newBusiness.save();
                return res.status(200).json({message : "Registration successful! Please proceed to login."});
            }
        } catch (err) {
            return next(new Error("An error occurred while saving, please try again!"));
        };
    } else {
        return next(new Error("Route not found!"));
    };
});




router.post("/auth/:entity/login", check("email").normalizeEmail().isEmail(), async function(req,res,next) {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return next(new Error("Invalid Inputs, please try again!"));
    }
    const email = req.body.email;
    const password = req.body.password;
    if (req.params.entity !== "users" && req.params.entity !== "businesses") {
        return next(new Error("Route not found!"));
    } else {
        let exist;
        if (req.params.entity === "users") {
            try{
                exist = await UsersDatabase.Users.findOne({email : email});
            } catch(err) {
                return next(new Error("An error occurred, please try again!"));
            }; 
        } else {
            try{
                exist = await BusinessesDatabase.Businesses.findOne({email : email, password : password});
            } catch(err) {
                return next(new Error("An error occurred, please try again!"));
            };  
        };
        let isValidPassword = false;
        if (exist) {
            try {
                isValidPassword = await bcrypt.compare(password, exist.password);
            } catch(err) {
                return next(new Error("An error occurred!, please try again"));
            }
            if (isValidPassword) {
                let token;
                try {
                    token = jwt.sign(
                        {userId : exist.id}, 
                        "please_dont_hack", 
                        {expiresIn : "1h"});
                } catch(err) {
                    return next(new Error("An error occurred!, Please Login again"));
                };
                return res.status(200).json({userId : exist.id, token : token});
            };
        };
        return next(new Error("Login unsuccessful, wrong email/password, please try again!"));
    };
});




/*

router.use(validateAuthToken);

}
*/
router.get("/feed", async (req,res,next) => {
    try {
        let data = await BusinessesDatabase.BusinessPosts.find();
        try {
            let postArrayPromise = Promise.all(data.map(async (post) => {
                let postObj = post.toObject({getters : true});
                let images = postObj.images;
                let imageArrayPromise = Promise.all(images.map( async (key) => {
                    const s3Params = {
                        Bucket : bucketName,
                        Key : key,
                    };
                    let command = new GetObjectCommand(s3Params);
                    return await getSignedUrl(s3, command, {expiresIn : 86400});
                }));
                
                await imageArrayPromise.then(imageArray => {postObj.images = imageArray;});
                return postObj;
            }));
            await postArrayPromise.then(postArray => {res.status(200).json(postArray);})
            return;
        } catch(err) {
            return next(new Error("retrieve error, please try again"));
        };
    } catch(err) {
        return next(new Error("retrieve error, please try again"));
    };
});


router.get("/personalpost/:entity/:UID", async (req,res,next) => {
    let data;
    if (req.params.entity !== "users" && req.params.entity !== "businesses") {
        return next(new Error("Route not found!"));
    } else {
        if (req.params.entity === "users") {
            try {
                data = await UsersDatabase.UserPosts.find({creator : req.params.UID});
                try {
                    let postArrayPromise = Promise.all(data.map(async (post) => {
                        let postObj = post.toObject({getters : true});
                        let images = postObj.images;
                        let imageArrayPromise = Promise.all(images.map( async (key) => {
                            const s3Params = {
                                Bucket : bucketName,
                                Key : key,
                            };
                            let command = new GetObjectCommand(s3Params);
                            return await getSignedUrl(s3, command, {expiresIn : 86400});
                        }));
                        
                        await imageArrayPromise.then(imageArray => {postObj.imageLinks = imageArray;});
                        return postObj;
                    }));
                    await postArrayPromise.then(postArray => {res.status(200).json(postArray);})
                    return;
                } catch(err) {
                    return next(new Error("retrieve error, please try again"));
                };
            } catch(err) {
                return next(new Error("Unknown Error Occurred!"));
            };
        } else {
            try {
                data = await BusinessesDatabase.BusinessPosts.find({creatorID : req.params.UID});
                return res.status(200).json(data.map((post) => {post.toObject({getters : true})}));
            } catch(err) {
                return next(new Error("Unknown Error Occurred!"));
            };
        }
    };
});

router.post("/uploadpersonalpost/:entity/:UID", multer.array("uploads"),async (req,res,next) => {
    const {location, address, description} = req.body;
    if (req.params.entity !== "users" && req.params.entity !== "businesses") {
        return next(new Error("Route not found!"));
    } else {
        let coor;
        try {
            coor = await getCoorForAddress(address);
        } catch(err) {
            return next(new Error("The inputted address is not recognised, please try again."));
        };
        let imageKeys;
        try {
            if(req.files) {
                let imageKeysPromise = Promise.all(req.files.map( async (file) => { 
                    let fileName = file.originalname + v4();
                    const s3Params = {
                        Bucket : bucketName,
                        Key : fileName,
                        Body : file.buffer,
                        ContentType : file.mimetype,
                    };
                    const command = new PutObjectCommand(s3Params);
                    try {
                        await s3.send(command);
                    } catch(err) {
                        console.log(err);
                        return next(new Error("An unknown error occurred, please try again!"));
                    };
                    return fileName;
                }));
                await imageKeysPromise.then(imageKeysArray => {imageKeys = imageKeysArray});
            } else {
                return next(new Error("No images found, please try again!"));
            };
        } catch(err) {
            return next(new Error("An unknown error occurred, please try again!"));
        };
        let upload;
        if (req.params.entity === "users") {
            upload = new UsersDatabase.UserPosts({
                location : location,
                address : address,
                coor : {
                    lat : coor.lat,
                    lng : coor.lng
                },
                images : imageKeys,
                description : description,
                creator : req.params.UID
            });
            try {
                const sess = await mongoose.startSession();
                sess.startTransaction();
                await upload.save({session : sess});
                let user = await UsersDatabase.Users.findById(req.params.UID);
                user.posts.push(upload);
                await user.save({session : sess});
                await sess.commitTransaction();
                return res.status(200).json({message : "upload successful"});
            } catch(err) {
                return next(new Error("An unknown error occurred, please try again!"));
            };
        } else {
            upload = new BusinessesDatabase.BusinessPosts({
                location : location,
                address : address,
                coor : {
                    lat : coor.lat,
                    lng : coor.lng
                },
                images : imageKeys,
                description : description,
                creator : req.params.uuid
            });
            try {
                const sess = await mongoose.StartSession();
                sess.startTransaction();
                await upload.save({session : sess});
                let business = await BusinessesDatabase.Businesses.findById(req.params.UID);
                business.posts.push(upload);
                await business.save({session : sess});
                await sess.commitTransaction();
                return res.status(200).json({message : "Update successful"});
            } catch(err) {
                return next(new Error("Unknown Error Occurred!"));
            };
        };
    };
});


router.post("/editpersonalpost/:entity/:UID", multer.array("uploads"), async (req,res,next) => {
    const {location, description, address, remainingImageKeys, id} = req.body;
    let post;
    try {
        post = await UsersDatabase.UserPosts.findOne({_id : id});
    } catch {
        return next(new Error("An unknown error occured, please try again."))
    };
    if (req.params.entity !== "users" && req.params.entity !== "businesses") {
        return next(new Error("Route not found!"));
    } else {
        let coor;
        try {
            coor = await getCoorForAddress(address);
        } catch(err) {
            return next(new Error("The inputted address is not recognised, please try again."));
        };
        let deletedImageKeys;
        try {
            if (!remainingImageKeys) {
                deletedImageKeys = post.images;
            } else {
                console.log(post);
                deletedImageKeys = post.images.filter(key => (!remainingImageKeys.includes(key)));
                console.log(deletedImageKeys);
            };
            deletedImageKeys.forEach(async key => {
                let param = {
                    Bucket : bucketName,
                    Key : key
                };
                let command = new DeleteObjectCommand(param);
                try {
                    await s3.send(command);
                    console.log("pass2");
                } catch {
                    console.log("pass3");
                    return new Error("An unknown error occurred, please try again!");
                }
            });
        } catch {
            return next(new Error("An unknown error occurred, please try again!"));
        };
        let imageKeys;
        try {
            if(req.files) {
                let imageKeysPromise = Promise.all(req.files.map( async (file) => { 
                    let fileName = file.originalname + v4();
                    const s3Params = {
                        Bucket : bucketName,
                        Key : fileName,
                        Body : file.buffer,
                        ContentType : file.mimetype,
                    };
                    const command = new PutObjectCommand(s3Params);
                    try {
                        await s3.send(command);
                    } catch(err) {
                        console.log(err);
                        return next(new Error("An unknown error occurred, please try again!"));
                    };
                    return fileName;
                }));
                await imageKeysPromise.then(imageKeysArray => {imageKeys = imageKeysArray});
            };
            
        } catch(err) {
            return next(new Error("An unknown error occurred, please try again!"));
        };
        if (!imageKeys) {
            imageKeys = remainingImageKeys;
        } else if (!remainingImageKeys) {
        } else {
            imageKeys = remainingImageKeys.concat(imageKeys);
        };
        console.log(imageKeys);
        let updatedUpload;
        if (req.params.entity === "users") {
            updatedUpload = {
                location : location,
                address : address,
                coor : {
                    lat : coor.lat,
                    lng : coor.lng
                },
                images : imageKeys,
                description : description,
                creator : req.params.UID
            };
            try {
                const sess = await mongoose.startSession();
                sess.startTransaction();
                await UsersDatabase.UserPosts.replaceOne({_id : id}, updatedUpload);
                await sess.commitTransaction();
                return res.status(200).json({message : "upload successful"});
            } catch(err) {
                return next(new Error("An unknown error occurred, please try again!"));
            };
        } else {
            updatedUpload = {
                location : location,
                address : address,
                coor : {
                    lat : coor.lat,
                    lng : coor.lng
                },
                images : imageKeys,
                description : description,
            };
            try {
                const sess = await mongoose.StartSession();
                sess.startTransaction();
                await BusinessesDatabase.Businesses.replaceOne({_id : id}, updatedUpload);
                await sess.commitTransaction();
                return res.status(200).json({message : "upload sucessful"});
            } catch(err) {
                return next(new Error("Unknown Error Occurred!"));
            };
        };
    };
});
/*

router.delete("/deletepersonalpost/:entity/:uuid")
*/

module.exports = router;
