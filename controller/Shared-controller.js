const express = require("express");
const mongoose = require("mongoose");
const { validationResult } = require("express-validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { v4 } = require('uuid');
const nodemailer = require("nodemailer");

const UsersDatabase = require("../MongooseModel/Users.js");
const BusinessesDatabase = require("../MongooseModel/Businesses.js");
const getCoorForAddress = require("../ThirdPartyAPI/GoogleMap.js");
const HttpError = require("../models/http-error.js");
const s3 = require("../ThirdPartyAPI/AwsBucketCred.js");
const bucketName = process.env.BUCKET_NAME;

const authRegister = async(req, res, next) => { // okay
    
    const validationErrors = validationResult(req);
        
    if (!validationErrors.isEmpty()) {
        return next(new HttpError("Please enter a valid email", 400));
    };
    
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const collection = req.params.entity === "users" ? UsersDatabase.Users : BusinessesDatabase.Businesses;  
    let user;
    let hashedPassword;
        
    try {
        user = await collection.findOne({email: email});

        if (user) {
            throw new HttpError("This email is already registered", 400);
        }
        hashedPassword = await bcrypt.hash(password, 12);
        const newUser = new collection({
            username : username,
            password : hashedPassword,
            email : email,
            profilePicture : 'EmptyProfile.png',
            public : false
        });
        await newUser.save();
        return res.status(201).json({
            message: "Registration successful."
        });
    } catch (err) {
        return next(new HttpError(err.message || "Unknown Error Occured While Registering", err.code || 404));
    };
};

const authLogin = async (req, res, next) => { 
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
        return next(new HttpError("Invalid Inputs, please try again", 400));
    }
    const email = req.body.email;
    const password = req.body.password;
    const collection = req.params.entity === "users" ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    let user;
    let isValidPassword;
    let token;   
    try {
        user = await collection.findOne({email: email});
        if (!user) {
            throw new HttpError("Cannot find User with email address", 404);
        };
        isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            throw new HttpError("Invalid Password, Please Try Again!", 404);
        };
        token = jwt.sign(
            {userId : user.id}, 
            "please_dont_hack", 
            {expiresIn : "1h"});
        return res.status(200).json({
            userId: user.id,
            token: token
        });
    } catch (err) {
        return next(new HttpError(err.message || "An Unknown Error Occured While Logging In", err.code || 404));
    };
};

const getVerificationCode = async (req, res, next) => {   
    const email = req.params.email.toLowerCase();
    const entity = req.params.entity;
    const collection = entity === "users" ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    let user;
    try {
        user = await collection.findOne({ email : email });
        if (!user) {
            throw new HttpError("User Not found", 404);
        };
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
        return res.status(200).json({
            message:"Please check your email for the verification code"
        });
    }  catch (err) {
        return next(new HttpError(err.message || "An Unknown Error Occured While Getting Verification Code", err.code || 404));
    };
};

const matchVerificationCode = async (req, res, next) => {
    let { email, verification } = req.body;
    email = email.toLowerCase();

    const collection = req.params.entity === "users" ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    let user;
    try {
        user = await collection.findOne( {email: email });
        if (!user) {
            throw new HttpError("User Not found", 404);
        };
        const verificationToken = user.resetCache;
        if (!verificationToken || verificationToken !== verification) {
            throw new HttpError("Invalid Verification Credentials", 401);
        } 
    } catch (err) {
        return next(new HttpError(err.message || "An Unknown Error Occured While Getting Verification Code", err.code || 404));
    }
    return res.status(201).json({
        message: "Verification successful"
    });
};

const resetPassword = async (req, res, next) => {
    let { email, verificationCode, password } = req.body;
    email = email.toLowerCase();
    const entity = req.params.entity;
    let user;
    let hashedPassword;
    let collections = entity === 'users' ? UsersDatabase.Users : BusinessesDatabase.Businesses; 
    try {
        user = await collections.findOne({ email : email });
        if (!user) {
            throw new HttpError("User Not found", 404);
        }; 
        if (!user.resetCache || user.resetCache !== verificationCode) {
            throw new HttpError("Invalid Verification Credential", 404);
        }
        hashedPassword = await bcrypt.hash(password, 12);
        await collections.updateOne( 
            {email: email}, 
            {$set: 
                {password: hashedPassword,
                resetCache: undefined}
            });
        } catch (err) {
            return next(new HttpError(err.message || "An Unknown Error Occured While Getting Verification Code", err.code || 404));
        }
        return res.status(201).json({
            message: "Successfully Resetted Password"
        });
    }

const getFeedByEntity = async (req,res,next) => {
    const entity = req.params.entity;
    if (entity !== 'users' && entity !== 'businesses') {
        return next(new HttpError("Route not found!", 404)); 
    };
    const collection = entity === "users" ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    try {
        let user = await collection.findById(req.params.UID);
        if (!user) {
            throw new HttpError("User Not Found", 404);
        };
        let userPost = await UsersDatabase.UserPosts.find();
        await Promise.all(userPost.map(async post => {await post.populate("creator"); return post;})).then(array => {userPost = array});
        userPost = userPost.filter(post => (post.creator === null ? false : post.creator.public)).slice(0,50);
        console.log("pass2");
        let businessesPost = await BusinessesDatabase.BusinessPosts.find().limit(50);
        let userBookmarkedToString = user.bookmarked.map(obj => (obj.postId.toString()));
        
        const getPostInfo = postEntity => {
            return async post => {
                let bookmarked = userBookmarkedToString.includes(post._id.toString());
                let postLikedBy = post.likedBy.map(obj => obj.doc.toString());
                let liked = postLikedBy.includes(user._id.toString());
                let numLikes = post.likedBy.length;
                let postObj = post.toObject({ getters: true });
                let images = postObj.images;    
                let imageArrayPromise = Promise.all(images.map( async key => {                 
                    const s3Params = {
                        Bucket : bucketName,
                        Key : key,
                    };
                    let command = new GetObjectCommand(s3Params);
                    return await getSignedUrl(s3, command, {expiresIn : 86400});
                }));       
                await imageArrayPromise.then(imageArray => {
                    postObj.images = imageArray; 
                    postObj.bookmarked = bookmarked;
                    postObj.postEntity = postEntity;
                    postObj.liked = liked;
                    postObj.numLikes = numLikes;
                });
                return postObj;
            };  
        }
        let userPostArrayPromise = Promise.all(userPost.map(getPostInfo('UserPost')));
        let businessesPostArrayPromise = Promise.all(businessesPost.map(getPostInfo('BusinessPost')));
        await userPostArrayPromise.then(postArray => {
            userPost = postArray;
        });
        await businessesPostArrayPromise.then(postArray => {
            businessesPost = postArray;
        });
        const combinedPost = userPost.concat(businessesPost).sort(() => {
            return Math.random() - 0.5;
        });
        return res.status(201).json(combinedPost);
    } catch(err) {
        return next(new HttpError(err.message || "Unknown Error", err.code || 404));
    };
}

const filterPost = async (req, res, next) => {
    const { query } = req.body;
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
};

const mongooseAutoComplete = async (req,res,next) => {
    const {query} = req.body;
    let data;
    try {
        data = await BusinessesDatabase.BusinessPosts.aggregate([
            {
                $search: {
                    index: "businesses_post_autocomplete",
                    compound : {
                        should : [
                            {
                            autocomplete : {
                                query: query,
                                path: "location"
                            }
                            },
                            {
                            autocomplete : {
                                query: query,
                                path: "tags"
                            }
                            },
                            {
                            autocomplete : {
                                query: query,
                                path: "address"
                            }
                            }
                        ]
                    }
                  }
            },
            {
                $project : {
                    "_id" : 0,
                    "location" : 1,
                    "tags" : 1
                }
            }
        ]);
        return res.status(200).json(data);
    } catch (err) {
        return next(new Error("Retrieval error, please try again"));
    };
};

const getProfileInfo = async (req,res,next) => {
    let userObj;
    const entity = req.params.entity;
    try {
        if (entity !== "users" && entity !== "businesses") {
            throw new HttpError("Route Not Found", 404);
        };
        userObj = entity === "users" 
               ? (await UsersDatabase.Users.findById(req.params.UID)) 
               : (await BusinessesDatabase.Businesses.findById(req.params.UID));
       const s3Params = {
            Bucket : bucketName,
            Key :  userObj.profilePicture,
        };
        let command = new GetObjectCommand(s3Params);
        let profilePicLink = await getSignedUrl(s3, command, {expiresIn : 86400});
        return res.status(200).json(
            {
                username :  userObj.username, 
                profilePicLink : profilePicLink,
                public :  userObj.public
            });
    } catch(err) {
        return next(new HttpError(err.message || "An Unknown Error Occured While Adding Bookmark", err.code || 404));
    };
};

const editProfileInfo = async (req,res,next) => {
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
        const sess = await mongoose.startSession();
        sess.startTransaction();
        user = await collection.findById(req.params.UID).session(sess);
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
            await collection.updateOne({_id : req.params.UID}, {$set: {profilePicture : fileName}}).session(sess);
        };
        if (username !== user.username) {
            await collection.updateOne({_id : req.params.UID}, {$set: {username : username}}).session(sess);
        };
        sess.commitTransaction();
        return res.status(200).json({message : "Profile updated successfully"});
    } catch (err) {
        return next(new Error("Unknown Error Occurred, please try again!"));
    };
};

const personalPost = async (req,res,next) => {
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
            return next(new Error("Retrieval error, please try again"));
        };
    } catch(err) {
        return next(new Error("Unknown Error Occurred!"));
    };
}


const uploadPersonalPost = async (req,res,next) => {
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
        let user = await userCollection.findById(req.params.UID).session(sess);
        user.posts.push(upload);
        await user.save({session : sess});
        await sess.commitTransaction();
        return res.status(200).json({message : "upload successful"});
    } catch(err) {
        return next(new Error("An unknown error occurred, please try again!"));
    };
};

const editPersonalPost = async (req,res,next) => {
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
        await collection.replaceOne({_id : id}, updatedUpload).session(sess);
        await sess.commitTransaction();
        return res.status(200).json({message : "update successful"});
    } catch(err) {
        return next(new Error("An unknown error occurred, please try again!"));
    };
};

const deletePersonalPost = async (req,res,next) => {
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
        const sess = await mongoose.startSession();
        sess.startTransaction();
        post = await postCollection.findById(postId).session(sess);
        user = await userCollection.findById(req.params.UID).session(sess);
        await postCollection.deleteOne({_id : postId}).session(sess);
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
};

const updatePrivacy = async (req,res,next) => {
    const {public} = req.body;
    let userCollection;
    try {
        if (req.params.entity === "users") {
            userCollection = UsersDatabase.Users;     
        } else if (req.params.entity === "businesses") {
            userCollection = BusinessesDatabase.Businesses;
        } else {
            return next(new Error("Route not found, please try again"));
        };
        await userCollection.updateOne({_id : req.params.UID}, {$set : {public : public}});
        return res.status(200).json({message : `Your account has been set to ${public ? "public" : "private" }`});
    } catch {
        return next(new Error("Unknown Error Occurred!"));
    };
};

const addBookmark = async (req, res, next) => { 
    const bookmarkerEntity = req.params.entity;
    const { postId, postEntity, bookmarked } = req.body;
    if (bookmarkerEntity !== "users" && bookmarkerEntity !== "businesses") {
        return next(new HttpError("Route not Found", 404));
    };
    if (postEntity !== "UserPost" && postEntity !== "BusinessPost") {
        return next(new HttpError("Route not Found", 404));
    };
    const bookmarkerCollection = bookmarkerEntity === 'users'
                           ? UsersDatabase.Users
                           : BusinessesDatabase.Businesses;
    const postCollection = postEntity === 'UserPost'
                           ? UsersDatabase.UserPosts
                           : BusinessesDatabase.BusinessPosts;                 
    let post;
    let bookmarker;
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        post = await postCollection.findById(postId).session(sess);
        if (!post) {
            throw new HttpError("Post does not exist, please try again!", 404);
        };
        bookmarker = await bookmarkerCollection.findById(req.params.UID).session(sess);
        if (bookmarked) {
            const bookmarkObj = {
                postId: post._id,
                postModel: postEntity
            };
            bookmarker.bookmarked.push(bookmarkObj);
        } else {
            bookmarker.bookmarked.pull({postId: post._id});
        }
        await bookmarker.save({session: sess});
        await sess.commitTransaction();
        await sess.endSession();
    } catch (err) {
        return next(new HttpError(err.message || "An Unknown Error Occured While Adding Bookmark", err.code || 404));
    }
    return res.status(200).json({
        message: "Bookmarked"
    });
};

const getBookmarkedPost = async (req,res,next) => {
    const entity = req.params.entity;
    if (entity !== 'users' && entity !== 'businesses') {
        throw new HttpError("Route Not Found", 404);
    };
    const userCollection = entity === 'users' ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    let user; 
    try {
        user = await userCollection.findById(req.params.UID);
        const getBookmarkedPostInfo = async post => {
            const postObj = post.postId.toObject({getters : true});
            let images = postObj.images;
            const imageArrayPromise = Promise.all(images.map(async key => {
                const s3Params = {
                    Bucket : bucketName,
                    Key : key,
                };
                let command = new GetObjectCommand(s3Params);
                return await getSignedUrl(s3, command, {expiresIn : 86400});
            }));    
            await imageArrayPromise.then(imageArray => {
                postObj.imageLinks = imageArray; 
                postObj.bookmarked = true;
                postObj.postEntity = post.postModel;
            });
            return postObj;
        };
        await user.populate("bookmarked.postId");
        let bookmarkedArrayPromise = Promise.all(user.bookmarked.map(getBookmarkedPostInfo));
        await bookmarkedArrayPromise.then(postArray => {
            console.log(postArray);
            res.status(200).json(postArray);
        })
    } catch(err) {
        return next(new Error("retrieve error, please try again"))
    };
};

const likeHandler = async (req, res, next) => {
    const likerEntity = req.params.entity;
    const likerId = req.params.UID;
    const { postId, postEntity, likeState } = req.body;
    let numLikes;
    if (postEntity !== "UserPost" && postEntity !== "BusinessPost") {
        throw new HttpError("Route Not Found", 404);
    };
    if (likerEntity !== "users" && likerEntity !== "businesses") {
        throw new HttpError("Route Not Found", 404);
    };
    const postCollection = postEntity === "UserPost" 
                           ? UsersDatabase.UserPosts
                           : BusinessesDatabase.BusinessPosts;
    
    const userCollection = likerEntity === "users"
                            ? UsersDatabase.Users
                            : BusinessesDatabase.Businesses;

    let liker;
    let post;
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        post = await postCollection.findById(postId).session(sess);
        if (!post) {
            throw new HttpError("Post does not exist, please try again!", 404);
        };
        liker = await userCollection.findById(likerId).session(sess);
        if (!liker) {
            throw new HttpError("User does not exist, please try again!", 404);   
        };
        if (likeState) {
            const token = likerEntity === 'users' ? 'User' : 'Business'
            const likedByObj = {
                doc: likerId,
                docModel: token
            };
            post.likedBy.push(likedByObj);
        } else {
            post.likedBy.pull({doc : likerId});
        };
        numLikes = post.likedBy.length;
        await post.save({session: sess});
        await sess.commitTransaction();
        await sess.endSession();
    } catch (err) {
        return next(new HttpError(err.message || "An Unknown Error Occured While Adding Bookmark", err.code || 404));
    }
    return res.status(200).json({
        message: "Liked",
        numLikes: numLikes
    });
}

const getComments = async (req, res, next) => {
    const { postId, postEntity, UID } = req.params;
    if (postEntity !== 'UserPost' && postEntity !== 'BusinessPost') {
        return next(new HttpError("Cannot Find Route", 404));
    }

    const postCollection = postEntity === "UserPost" 
                           ? UsersDatabase.UserPosts
                           : BusinessesDatabase.BusinessPosts;
    let post;
    try {
        post = await postCollection.findById(postId, 'comments');

        if (!post) {
            throw new HttpError("Cannot Find Post", 404);
        }
        await post.populate('comments.doc');
        await post.populate('comments.replies.doc');
        const comments = post.comments;
        
        const getCommentInfo = async comment => {
            const commentLikedBy = comment.likedBy.map(obj => obj.doc.toString()).includes(UID);
            const numLikes = comment.likedBy.length;
            let repliesObjArray;
            
            const getProfilePic = async key => {
                const s3Params = {
                    Bucket : bucketName,
                    Key : key,
                };
                let command = new GetObjectCommand(s3Params);
                return await getSignedUrl(s3, command, {expiresIn : 86400});
            }

            const getReplyInfo = async reply => {
                const profilePic = await getProfilePic(reply.doc.profilePicture);
                const replyObj = reply.toObject({getters: true});
                replyObj.profilePicture = profilePic;
                replyObj.id = reply._id;
                return replyObj;
            }
            
            await Promise.all(comment.replies.map(getReplyInfo)).then(repliesArray => {
                repliesObjArray = repliesArray;
            });
            const profilePic = await getProfilePic(comment.doc.profilePicture);
            const commentObj = comment.toObject({getters: true});
            commentObj.commentLikedBy = commentLikedBy;
            commentObj.numLikes = numLikes;
            commentObj.profilePicture = profilePic;
            commentObj.id = comment._id;
            commentObj.replies = repliesObjArray;
            return commentObj;
        };
        await Promise.all(comments.map(getCommentInfo)).then(commentArray  => {
            res.status(202).json(commentArray);
        })
    } catch (err) {
        return next(new HttpError(err.message || "Unknown Error Occured", err.code || 404));
    }
};

const postComments = async (req, res, next) => {
    const { UID, entity } = req.params;
    const { postId, commentText, postEntity } = req.body; 
    if (entity !== 'users' && entity !== 'businesses') {
        throw new HttpError("Route Not Foud", 404);
    }

    if (postEntity !== 'UserPost' && postEntity !== 'BusinessPost') {
        throw new HttpError("Route Not Foud", 404);
    }
    const collection = entity === 'users' ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    const postCollection = postEntity === 'UserPost' ? UsersDatabase.UserPosts : BusinessesDatabase.BusinessPosts;
    let post;
    let user;
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        user = await collection.findById(UID).session(sess);
        if (!user) {
            throw new HttpError("No User Found", 404);
        }
        post = await postCollection.findById(postId).session(sess);
        if (!post) {
            throw new HttpError("No Post Found", 404);
        }
        const token = entity === 'users' ? 'User' : 'Business'
        const commentObj = {
            body: commentText,
            doc: user._id,
            docModel: token,
            likedBy: []
        };
        post.comments.push(commentObj);
        await post.save({session: sess});
        await sess.commitTransaction();
        await sess.endSession();
    } catch (err) {
        return next(new HttpError(err.msg || "Unknown Error Occurred"), err.code || 404);
    }
    return res.status(201).json({
        message: "Commented"
    });
}

const likeCommentHandler = async (req, res, next) => {
    const { likerEntity, UID } = req.params;
    const { postId, postEntity, commentId, likeState } = req.body;
    if (likerEntity !== 'users' && likerEntity !== 'businesses') {
        return next(new HttpError("Route Not Foud", 404));
    };
    if (postEntity !== 'UserPost' && postEntity !== 'BusinessPost') {
        return next(new HttpError("Route Not Foud", 404));
    };
    const likerCollection = likerEntity === 'users' ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    const postCollection = postEntity === 'UserPost' ? UsersDatabase.UserPosts : BusinessesDatabase.BusinessPosts;
    let post;
    let liker;
    const token = likerEntity === 'users' ? 'User' : 'Business';
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        liker = await likerCollection.findById(UID).session(sess);
        if (!liker) {
            throw new HttpError("Cannot Find User", 404);
        };
        post = await postCollection.findById(postId, 'comments').session(sess);
        if (!post) {
            throw new HttpError("Cannot Find Post", 404);
        }
        const commentObj = post.comments.id(commentId);
        if (likeState) {
            const likedByObj = {
                doc: UID,
                docModel: token
            }
            commentObj.likedBy.push(likedByObj);
        } 
        if (!likeState) {
            commentObj.likedBy.pull({doc : UID});
        };
        await post.save({session: sess});
        await sess.commitTransaction();
        await sess.endSession();
    } catch (err) {
        return next(new HttpError(err.message || "Unknown Error Occured", err.code || 404));
    }
    return res.status(202).json({
        message: "Successfully liked Comment"
    })
};

const replyComment = async (req, res, next) => {
    const { entity, UID } = req.params;
    const { postId, postEntity, commentId, body } = req.body;

    if (entity !== 'users' && entity !== 'businesses') {
        return next(new HttpError("Route Not Foud", 404));
    }

    if (postEntity !== 'UserPost' && postEntity !== 'BusinessPost') {
        return next(new HttpError("Route Not Foud", 404));
    }

    const userCollection = entity === 'users' ? UsersDatabase.Users : BusinessesDatabase.Businesses;
    const postCollection = postEntity === 'UserPost' ? UsersDatabase.UserPosts : BusinessesDatabase.BusinessPosts;
    let post;
    let user;
    const token = entity === 'users' ? 'User' : 'Business';

    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        user = await userCollection.findById(UID).session(sess);
        if (!user) {
            throw new HttpError("Cannot Find User", 404);
        }

        post = await postCollection.findById(postId, 'comments').session(sess);
        
        if (!post) {
            throw new HttpError("Cannot Find Post", 404);
        }

        await post.populate('comments.doc');

        const commentObj = post.comments.id(commentId);
        const replyObj = {
            body: body,
            doc: UID,
            docModel: token
        }
        commentObj.replies.push(replyObj);
        await post.save({session: sess});
        await sess.commitTransaction();
        await sess.endSession();
        await post.populate('comments.replies.doc');
        
        const getReplyInfo = async reply => {
            const getProfilePic = async key => {
                const s3Params = {
                    Bucket : bucketName,
                    Key : key,
                };
                let command = new GetObjectCommand(s3Params);
                return await getSignedUrl(s3, command, {expiresIn : 86400});
            }
            const profilePic = await getProfilePic(reply.doc.profilePicture);
            const replyObj = reply.toObject({getters: true});
            replyObj.profilePicture = profilePic;
            replyObj.id = reply._id;
            return replyObj;
        }
        await Promise.all(commentObj.replies.map(getReplyInfo)).then(repliesArray => {
            res.status(202).json(repliesArray);
        });
    } catch (err) {
        return next(new HttpError(err.message || "Unknown Error Occured", err.code || 404));
    };
};






exports.authRegister = authRegister;
exports.authLogin = authLogin;
exports.getVerificationCode = getVerificationCode;
exports.matchVerificationCode = matchVerificationCode;
exports.resetPassword = resetPassword;
exports.getFeedByEntity = getFeedByEntity;
exports.filterPost = filterPost;
exports.mongooseAutoComplete = mongooseAutoComplete;
exports.addBookmark = addBookmark;
exports.getProfileInfo = getProfileInfo;
exports.editProfileInfo = editProfileInfo;
exports.personalPost = personalPost;
exports.getBookmarkedPost = getBookmarkedPost;
exports.uploadPersonalPost = uploadPersonalPost;
exports.likeHandler = likeHandler;
exports.postComments = postComments;
exports.editPersonalPost = editPersonalPost;
exports.deletePersonalPost = deletePersonalPost;
exports.getComments = getComments;
exports.likeCommentHandler = likeCommentHandler;
exports.replyComment = replyComment;
exports.updatePrivacy = updatePrivacy;