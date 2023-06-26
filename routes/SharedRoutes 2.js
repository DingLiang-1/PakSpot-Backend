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
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

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
        return next(new Error("Invalid Inputs"));
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
                    return next(new Error("Unknown Error Occurred, Please try again!"));
                };
                const newUser = new UsersDatabase.Users({
                    username : username,
                    password : hashedPassword,
                    email : email,
                });
                await newUser.save();
                return res.json({message : "Registration successful! Please proceed to login."});
            }
        } catch (err) {
            return next(new Error("An error occurred while saving, please try again!").status(404));
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
        return next(new Error("Invalid Inputs"));
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
                return next(new Error("An error occurred!"));
            }; 
        } else {
            try{
                exist = await BusinessesDatabase.Businesses.findOne({email : email, password : password});
            } catch(err) {
                return next(new Error("An error occurred!"));
            };  
        };
        let isValidPassword = false;
        if (exist) {
            try {
                isValidPassword = await bcrypt.compare(password, exist.password);
            } catch(err) {
                return next(new Error("An error occurred!, Please try again"));
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
        return next(new Error("Login unsuccessful, please try again!"));
    };
});




/*

router.use(validateAuthToken);
router.get("/feed", async (req,res,next) {

}
*/



router.get("/personalpost/:entity/:UID", async (req,res,next) => {
    let data;
    if (req.params.entity !== "users" && req.params.entity !== "businesses") {
        return next(new Error("Route not found!"));
    } else {
        if (req.params.entity === "users") {
            try {
                data = await UsersDatabase.UserPosts.find({creatorID : req.params.UID});
                return res.status(200).json(data.map((post) => {post.toObject({getters : true})}));
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

router.post("/uploadpersonalpost/users/:UID", multer.array("uploads"), async (req,res,next) => {
    try {
        if(req.files) {
            req.files.forEach( async (file) => {
                const s3Params = {
                    Bucket : bucketName,
                    Key : file.originalname,
                    Body : file.buffer,
                    ContentType : file.mimetype,
                };
                const command = new PutObjectCommand(s3Params);
                await s3.send(command);
            });
            /*req.files.forEach((image) => {
                const blob = bucket.file(image.originalname);
                const blobStream = blob.createWriteStream();
                blobStream.on("finish",() => {
                    console.log({message : "upload to cloud succesful"});
                });
                blobStream.end(image.buffer);
            });*/
            return res.status(200).json({message : "upload Successful"})
        } else {
            return next(new Error("No images found, please try again!"));
        }
    }catch(err) {
        return next(new Error("Upload unsuccessful"));
    };
});


    /*
    let upload;
    let coor;
    let [location,address,images] = req.body;
    if (req.params.entity !== "users" && req.params.entity !== "businesses") {
        return next(new Error("Route not found!").status(404));
    } else {
        try {
            coor = await getCoorForAddress(address);
        } catch(err) {
            return next(new Error("Invalid Address, please try again")).status(404);
        };
        if (req.params.entity === "users") {
            upload = new UsersDatabase.UserPosts({
                location : location,
                address : address,
                coor : {
                    lat : coor.lat,
                    lng : coor.lng
                },
                images : "dummy",
                creator : req.params.uuid
            });
            try {
                const sess = await mongoose.StartSession();
                sess.startTransaction();
                await upload.save({session : sess});
                let user = await UsersDatabase.Users.findById(req.params.uuid);
                user.posts.push(upload);
                await user.save({session : sess});
                await sess.commitTransaction();
                return res.status(200).json({message : "upload sucessful"});
            } catch(err) {
                return next(new Error("Unknown Error Occurred!").status(404));
            };
        } else {
            upload = new BusinessesDatabase.BusinessPosts({
                location : location,
                address : address,
                coor : {
                    lat : coor.lat,
                    lng : coor.lng
                },
                images : [{type:String}],
                creator : req.params.uuid
            });
            try {
                const sess = await mongoose.StartSession();
                sess.startTransaction();
                await upload.save({session : sess});
                let business = await BusinessesDatabase.Businesses.findById(req.params.uuid);
                business.posts.push(upload);
                await business.save({session : sess});
                await sess.commitTransaction();
                return res.status(200).json({message : "upload sucessful"});
            } catch(err) {
                return next(new Error("Unknown Error Occurred!").status(404));
            };
        };
    };
});*/

/*
router.patch("/editpersonalpost/:entity/:uuid")

router.delete("/deletepersonalpost/:entity/:uuid")
*/

module.exports = router;
