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
const nodemailer = require("nodemailer");

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
/*
router.use(validateAuthToken);
*/

router.post("/auth/register/:entity",
    [check("username").isLength({min : 8}),
    check("password").isLength({min : 8}),
    check("email").normalizeEmail().isEmail()],
    async function(req,res,next) {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return next(new Error("invalid email address, please try again!"));
        };
        const username = req.body.username;
        const email = req.body.email;
        const password = req.body.password;
        let collection;
        if (req.params.entity === "users") {
            collection = UsersDatabase.Users;
        } else if (req.params.entity === "businesses") {
            collection = BusinessesDatabase.Businesses;
        } else {
            return next(new Error("Route not found!")); 
        }
        let userExist;
        try {
            userExist = await collection.findOne({email : email});
            if (userExist) {
                return next(new Error("This Email already has an Account!"));
            } else {
                let hashedPassword;
                try {
                    hashedPassword = await bcrypt.hash(password, 12);
                } catch (err) {
                    return next(new Error("Unknown error occurred, please register again!"));
                };
                const newUser = new collection({
                    username : username,
                    password : hashedPassword,
                    email : email,
                    profilePicture : 'EmptyProfile.png',
                });
                await newUser.save();
                return res.json({message : "Registration successful! Please proceed to login."});
            }
    } catch (err) {
            return next(new Error("An error occurred while register, please try again!").status(404));
    };
});


router.post("/auth/login/:entity", check("email").normalizeEmail().isEmail(), async function(req,res,next) {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return next(new Error("Invalid Inputs, please try again!"));
    }
    const email = req.body.email;
    const password = req.body.password;
    let collection;
    if (req.params.entity === "users") {
        collection = UsersDatabase.Users;
    } else if (req.params.entity === "businesses") {
        collection = BusinessesDatabase.Businesses;
    }
    else {
        return next(new Error("Route not found!"));
    };
    let exist;
    try{
        exist = await collection.findOne({email : email});
    } catch(err) {
        return next(new Error("An error occurred, please try again!"));
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
});


router.get("/auth/getverificationcode/:entity/:email", async (req, res, next) => {
    const email = req.params.email.toLowerCase();
    const entity = req.params.entity;
    let user;
    let collection;
    if (entity === 'users') {
        collection = UsersDatabase.Users;
    } else if (entity === "businesses") {
        collection = BusinessesDatabase.Businesses;
    } else {
        return next(new Error("An error occured, please try again"));
    }
    try {
        user = await collection.findOne({ email : email });
    } catch (err) {
        const error = new Error("Unknown Error Occurred! Please Try Again.");
        error.code = 401;
        return next(error);
    };
    if (!user) {
        return next(new Error("This email does not have an account"));
    };
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: 'simdinghao@gmail.com',
              pass: process.env.GMAIL_KEY
            }
        });
        const token = v4();
        await transporter.sendMail({
            from: `simdinghao@gmail.com`,
            to: `${email}`,
            subject: "Reset Password verification code",  
            text: `Please enter verification token below to reset password: ${token}`
        });
        await collection.updateOne({email: email}, {$set: {resetCache: token}});
        return res.status(200).json({message:"Please check your email for the verification code"});
    } catch (err) {
        const error = new Error("Unknown Error Occurred! Please Try Again.");
        error.code = 401;
        return next(error);
    };
});

router.post("/auth/matchverificationcode/:entity", async (req, res, next) => {
    let {email, verificationCode} = req.body;
    email = email.toLowerCase();
    const entity = req.params.entity;
    let user;
    let collection;
    if (entity === 'users') {
        collection = UsersDatabase.Users;
    } else if (entity === "businesses") {
        collection = BusinessesDatabase.Businesses;
    } else {
        return next(new Error("An error occured, please try again"));
    }
    try {
        user = await collection.findOne({ email : email });
    } catch (err) {
        const error = new Error("Unknown Error Occurred! Please Try Again.");
        error.code = 401;
        return next(error);
    }
    if (!user) {
        const error = new Error("This email does not have an account");
        error.code = 401;
        return next(error);
    };

    const verificationToken = user.resetCache;

    if (!verificationToken || verificationToken !== verificationCode) {
        const error = new Error("Invalid Verification Code. please try Again");
        error.code = 401;
        return next(error);
    };
    return res.status(201).json({
        message: "Successfully Verified, Please Reset Password"
    });
});

router.post("/auth/resetpassword/:entity", async (req, res, next) => {
    let { email, verificationCode, password } = req.body;
    email = email.toLowerCase();
    const entity = req.params.entity;
    let user;
    let verificationCodeValid;
    let collections = entity === 'users' ? UsersDatabase.Users : BusinessesDatabase.Businesses; 

    try {
        user = await collections.findOne({ email : email });
        verificationCodeValid = (user.resetCache === verificationCode);
    } catch (err) {
        const error = new Error("Unknown Error Occurred! Please Try Again.");
        error.code = 401;
        return next(error);
    }

    if (!user || !verificationCodeValid) {
        const error = new Error("Invalid Email please try again");
        error.code = 401;
        return next(error);
    };
    let hashedPassword;
    try {
        hashedPassword = await bcrypt.hash(password, 12);
        await collections.updateOne({email: email}, {$set: {password: hashedPassword, resetCache : undefined}});
    } catch (err) {
        return next(new Error("Unknown error occurred, please register again!"));
    };
    return res.status(201).json({
        message: "SuccessFully Resetted PassWord"
    });
});

router.get("/feed/:entity/:UID", async (req,res,next) => {
    try {
        let data = await BusinessesDatabase.BusinessPosts.find();
        let collection;
        if (req.params.entity === "users") {
            collection = UsersDatabase.Users;
        } else if (req.params.entity === "businesses") {
            collection = BusinessesDatabase.Businesses;
        } else {
            return next(new Error("Route not found!")); 
        };
        try {
            let user = await collection.findById(req.params.UID);
            let postArrayPromise = Promise.all(data.map(async (post) => {
                let bookmarked = await user.bookmarked.includes(post._id);
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
                
                await imageArrayPromise.then(imageArray => {postObj.images = imageArray; postObj.bookmarked = bookmarked});
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

router.post("/filterpost", async (req,res,next) => {
    const {query} = req.body;
    let data;
    try {
        data = await BusinessesDatabase.BusinessPosts.aggregate([
            {
              $search: {
                index: "search_business_post",
                text: {
                  query: query,
                  path: {
                    wildcard: "*"
                  }
                }
              }
            }
        ]);
        let postArrayPromise = Promise.all(data.map(async (postObj) => {
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
    } catch (err) {
        return next(new Error("Retrieval error, please try again"));
    };
});

router.post("/addbookmark/:entity/:UID", async (req,res,next) => {
    let data;
    let {postId, bookmarked} = req.body;
    try {
        let businessPost = await BusinessesDatabase.BusinessPosts.findById(postId);
        if (!businessPost) {
            return next(new Error("Post does not exist, please try again!"));
        }
        if (req.params.entity !== "users" && req.params.entity !== "businesses") {
            return next(new Error("Route not found!"));
        };
        if (req.params.entity === "users") {
            data = await UsersDatabase.Users.findById(req.params.UID);
        } else {
            data = await BusinessesDatabase.Businesses.findById(req.params.UID);
        };
        if (bookmarked) {
            data.bookmarked.push(businessPost);
            data.save();
        } else {
            data.bookmarked.pull(businessPost);
            data.save();
        };
        return res.status(200).json({message:"bookmarked"});
    } catch (err) {
        return next(new Error("An error occured, please try again!"));
    };
});

router.get("/getprofileinfo/:entity/:UID", async (req,res,next) => {
    let data;
    try {
        if (req.params.entity !== "users" && req.params.entity !== "businesses") {
            return next(new Error("Route not found!"));
        };
        if (req.params.entity === "users") {
            data = await UsersDatabase.Users.findById(req.params.UID);
        } else {
            data = await BusinessesDatabase.Businesses.findById(req.params.UID);
        };
        const s3Params = {
            Bucket : bucketName,
            Key : data.profilePicture,
        };
        let command = new GetObjectCommand(s3Params);
        let profilePicLink = await getSignedUrl(s3, command, {expiresIn : 86400});
        return res.status(200).json({username : data.username, profilePicLink : profilePicLink});
    } catch(err) {
        return next(new Error("retrieve error, please try again"));
    };
});

router.post("/editprofileinfo/:entity/:UID", multer.single("newProfPic"), async (req,res,next) => {
    const {username} = req.body;
    const imageFile = req.file;
    let user;
    let collection;
    if (req.params.entity === "users") {
        collection = UsersDatabase.Users;
    } else if (req.params.entity === "businesses") {
        collection = BusinessesDatabase.Businesses;
    } else {
        return next(new Error("Route not found!"));
    };
    try {
        user = await collection.findById(req.params.UID);
        if (imageFile) {
            let currentKey = user.profilePicture;
            if (currentKey !== "EmptyProfile.png") {
                let deleteParam = {
                    Bucket : bucketName,
                    Key : currentKey
                };
                let deleteCommand = new DeleteObjectCommand(deleteParam);
                try {
                    await s3.send(deleteCommand);
                } catch {
                    return new Error("An unknown error occurred, please try again!");
                };
            };
            console.log(imageFile);
            let fileName = imageFile.originalname + v4();
            let addParams = {
                Bucket : bucketName,
                Key : fileName,
                Body : imageFile.buffer,
                ContentType : imageFile.mimetype,
            };
            const addCommand = new PutObjectCommand(addParams);
            try {
                await s3.send(addCommand);
            } catch(err) {
                return next(new Error("An unknown error occurred, please try again!"));
            };
            await collection.updateOne({_id : req.params.UID}, {$set: {profilePicture : fileName}});
        };
        if (username !== user.username) {
            await collection.updateOne({_id : req.params.UID}, {$set: {username : username}});
        };
        console.log(await collection.findById(req.params.UID));
        return res.status(200).json({message : "Profile updated successfully"});
    } catch (err) {
        return next(new Error("Unknown Error Occurred, please try again!"));
    };
});

router.get("/personalpost/:entity/:UID", async (req,res,next) => {
    let data;
    let collection;
    if (req.params.entity === "users") {
        collection = UsersDatabase.UserPosts;
    } else if (req.params.entity === "businesses") {
        collection = BusinessesDatabase.BusinessPosts;
    } else {
        return next(new Error("Route not found!"));
    };
    try {
        data = await collection.find({creator : req.params.UID});
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
});


router.get("/bookmarkpost/:entity/:UID", async (req,res,next) => {
    let userCollection;
    if (req.params.entity === "users") {
        userCollection = UsersDatabase.Users;
    } else if (req.params.entity === "businesses") {
        userCollection = BusinessesDatabase.Businesses;
    } else {
        return next(new Error("Route not found!"));
    }
    let bookmarkedPost = await userCollection.findById(req.params.UID);
    let businessPostsCollection = BusinessesDatabase.BusinessPosts;
    try { 
        try {
            let postArrayPromise = Promise.all(bookmarkedPost.bookmarked.map(async (id) => {
                let postObj = await businessPostsCollection.findById(id);
                postObj = postObj.toObject({getters : true});
                let images = postObj.images;
                let imageArrayPromise = Promise.all(images.map( async (key) => {
                    const s3Params = {
                        Bucket : bucketName,
                        Key : key,
                    };
                    let command = new GetObjectCommand(s3Params);
                    return await getSignedUrl(s3, command, {expiresIn : 86400});
                }));
                
                await imageArrayPromise.then(imageArray => {postObj.imageLinks = imageArray; postObj.bookmarked = true});
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
});

router.post("/uploadpersonalpost/:entity/:UID", multer.array("uploads"),async (req,res,next) => {
    const {location, address, description,stringTag} = req.body;
    let arrayTag = stringTag.split("#").map(tag => (tag.trim())).slice(1);
    let postCollection;
    let userCollection;
    if (req.params.entity === "users") {
        postCollection = UsersDatabase.UserPosts;
        userCollection = UsersDatabase.Users;
    } else if (req.params.entity === "businesses") {
        postCollection = BusinessesDatabase.BusinessPosts;
        userCollection = BusinessesDatabase.Businesses;
    } else {
        return next(new Error("Route not found!"));
    }
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
    let upload = new postCollection({
        location : location,
        address : address,
        coor : {
            lat : coor.lat,
            lng : coor.lng
        },
        images : imageKeys,
        description : description,
        creator : req.params.UID,
        tags : arrayTag
    });
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        await upload.save({session : sess});
        let user = await userCollection.findById(req.params.UID);
        user.posts.push(upload);
        await user.save({session : sess});
        await sess.commitTransaction();
        return res.status(200).json({message : "upload successful"});
    } catch(err) {
        return next(new Error("An unknown error occurred, please try again!"));
    };
});


router.post("/editpersonalpost/:entity/:UID", multer.array("uploads"), async (req,res,next) => {
    let {location, description, address, remainingImageKeys, id, stringTag} = req.body;
    let arrayTag = stringTag.split("#").map(tag => (tag.trim())).slice(1);
    let collection;
    if (req.params.entity === "users") {
        collection = UsersDatabase.UserPosts;
    } else if (req.params.entity === "businesses") {
        collection = BusinessesDatabase.BusinessPosts;
    } else {
        return next(new Error("Route not found!"));
    }
    if ((typeof remainingImageKeys) === "string") {
        remainingImageKeys = [remainingImageKeys];
    };
    let post;
    try {
        post = await collection.findOne({_id : id});
    } catch {
        return next(new Error("An unknown error occured, please try again."))
    };
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
            deletedImageKeys = post.images.filter(key => (!remainingImageKeys.includes(key)));
        };
        deletedImageKeys.forEach(async key => {
            let param = {
                Bucket : bucketName,
                Key : key
            };
            let command = new DeleteObjectCommand(param);
            try {
                await s3.send(command);
            } catch {
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
    let updatedUpload = {
        location : location,
        address : address,
        coor : {
            lat : coor.lat,
            lng : coor.lng
        },
        images : imageKeys,
        description : description,
        creator : req.params.UID,
        tags : arrayTag
    };
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        await collection.replaceOne({_id : id}, updatedUpload);
        await sess.commitTransaction();
        return res.status(200).json({message : "update successful"});
    } catch(err) {
        return next(new Error("An unknown error occurred, please try again!"));
    };
});


router.post("/deletepersonalpost/:entity/:UID", async (req,res,next) => {
    const {postId} = req.body;
    let postCollection;
    let userCollection;
    try {
        if (req.params.entity === "users") {
            postCollection = UsersDatabase.UserPosts;
            userCollection = UsersDatabase.Users;     
        } else if (req.params.entity === "businesses") {
            postCollection = BusinessesDatabase.BusinessPosts;
            userCollection = BusinessesDatabase.Businesses;
        } else {
            return next(new Error("Route not found, please try again"));
        };
        post = await postCollection.findById(postId);
        user = await userCollection.findById(req.params.UID);
        const sess = await mongoose.startSession();
        sess.startTransaction();
        await postCollection.deleteOne({_id : postId});
        await user.posts.pull(post);
        await user.save({session :sess});
        await sess.commitTransaction();
        post.images.forEach(async key => {
            let param = {
                Bucket : bucketName,
                Key : key
            };
            let command = new DeleteObjectCommand(param);
            try {
                await s3.send(command);
            } catch {
                return new Error("An unknown error occurred, please try again!");
            }
        });
        return res.status(200).json({message : "Delete sucessful"});
    } catch {
        return next(new Error("Unknown Error Occurred!"));
    };
});



module.exports = router;
