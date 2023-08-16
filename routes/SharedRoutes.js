const express = require("express");
const { check } = require("express-validator");
const router = express.Router();
const sharedController = require('../controller/Shared-controller.js');
const multer = require("../Middlewares/MulterMiddleWare.js");
const validateAuthToken = require("../Middlewares/authMiddleware.js");

router.post('/auth/register/:entity',
    [
        check('username')
            .isLength({min : 8}),
        check('password')
            .isLength({min : 8}),
        check("email")
            .normalizeEmail() 
            .isEmail()
    ],
    sharedController.authRegister) ;


router.post("/auth/login/:entity", 
    [
        check("email")
            .normalizeEmail()
            .isEmail()
    ], 
    sharedController.authLogin);


router.get("/auth/getverificationcode/:entity/:email", 
    sharedController.getVerificationCode);

router.post("/auth/matchverificationcode/:entity", 
    sharedController.matchVerificationCode);

router.post("/auth/resetpassword/:entity", 
    sharedController.resetPassword);

router.use(validateAuthToken);

router.get("/feed/:entity/:UID",
    sharedController.getFeedByEntity);

router.post("/filterpost", 
    sharedController.filterPost);

router.post("/autocomplete",
    sharedController.mongooseAutoComplete);

router.post("/addbookmark/:entity/:UID", 
    sharedController.addBookmark);

router.get("/getprofileinfo/:entity/:UID",
    sharedController.getProfileInfo);

router.post("/editprofileinfo/:entity/:UID", 
    multer.single("newProfPic"),
    sharedController.editProfileInfo);

router.get("/personalpost/:entity/:UID", 
    sharedController.personalPost);


router.get("/bookmarkpost/:entity/:UID", 
    sharedController.getBookmarkedPost);

router.post("/uploadpersonalpost/:entity/:UID", 
    multer.array("uploads"),
    sharedController.uploadPersonalPost);


router.post("/editpersonalpost/:entity/:UID", 
    multer.array("uploads"), 
    sharedController.editPersonalPost);


router.post("/deletepersonalpost/:entity/:UID", 
    sharedController.deletePersonalPost);

router.post("/comment/:entity/:UID", 
    sharedController.postComments);

router.post("/like/:entity/:UID",
    sharedController.likeHandler);

router.get("/getComment/:postId/:postEntity/:UID",
    sharedController.getComments);

router.post("/postcomment/:entity/:UID",
    sharedController.postComments);

router.post("/likeComment/:likerEntity/:UID",
    sharedController.likeCommentHandler);

router.post("/replyComment/:entity/:UID",
    sharedController.replyComment);

router.post("/updateprivacy/:entity/:UID", 
    sharedController.updatePrivacy);

router.post("/deleteComment/:entity/:UID",
    sharedController.deleteComment);

router.post("/deleteReply/:entity/:UID",
    sharedController.deleteReply);


module.exports = router;
