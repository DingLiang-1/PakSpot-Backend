const express = require("express");
const router = express.Router();

const userController = require('../controller/User-controller.js');
const validateAuthToken = require("../Middlewares/authMiddleware.js");

router.use(validateAuthToken);

router.post("/getscheduledevents/:UID", 
    validateAuthToken,
    userController.getScheduledEvents);

router.post("/addscheduledevent/:UID", 
    validateAuthToken,
    userController.addScheduledEvent);


router.post("/editscheduledevent/:UID", 
    userController.editScheduleEvent);
        

router.post("/deletescheduledevent/:UID", 
    userController.deleteScheduledEvent);

module.exports = router;

