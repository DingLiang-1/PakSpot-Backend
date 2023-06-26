const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const getCoorForAddress = require("../GoogleMap.js");
const UsersDatabase = require("../MongooseModel/Users.js");
const validateAuthToken = require("../authMiddleware.js");



router.post("/getscheduledevents/:UID", validateAuthToken,  async (req,res,next) => {
    const {month, year} = req.body;
    let user;
    let eventsMonth;
    try {
        user = await UsersDatabase.Users.findById(req.params.UID);
    } catch(err) {
        return next(new Error("Unknown error, please try again"));
    };
    if (user) {
        try{
            eventsMonth = await user.events.filter((docs) => (docs.year === year && docs.month === month));
        } catch(err) {
            return next(new Error("Unknown error, please try again"));
        };
        if (eventsMonth.length) {
            return res.status(200).json({events : eventsMonth});
        } else {
            return res.status(200).json({events : []});
        };
    } else {
        return next(new Error("User not found, please try again"));
    };
});

router.post("/addscheduledevent/:UID", validateAuthToken, async (req, res, next) => {
    let {location, address, date, startTime, endTime, description} = req.body;
    let coor;
    try {
        coor = await getCoorForAddress(address);
    } catch(err) {
        return next(new Error("Invalid Address, please try again"));
    };
    let user;
    try {
        user = await UsersDatabase.Users.findById(req.params.UID);
    } catch(err) {
        return next(new Error("Unknown error, please try again"));
    };
    if (!user) {
        return next(new Error("User not found, please try again"));
    }
    date = new Date(date);
    let dateDay = date.getDate().toString();
    let dateMonth = (date.getMonth() + 1).toString();
    let dateYear = date.getFullYear().toString();
    let datePresent;
    let event;
    try {
        datePresent = user.events.filter((docs) => (docs.year === dateYear && docs.month === dateMonth && docs.day === dateDay));
    } catch(err) {
        return next(new Error("Unknown error, please try again"));
    };
    if (datePresent.length) {
        try {
            event = await datePresent[0].events.filter((docs) => (docs.startTime === startTime && docs.endTime === endTime));
        } catch(err) {
            return next(new Error("Unknown error, please try again"));
        };
        if (event.length) {
            return next(new Error("An event is already scheduled at specified date and time. Please try again."));
        } else {
            try {
                await user.events.id(datePresent[0]._id).events.push({startTime : startTime, endTime : endTime, location : location, address : address, coor : coor, description : description});
                await user.save()
                return res.status(200).json({message : "event added succesfully"});
            } catch(err) {
                return next(new Error("Unknown error, please try again"));
            };
        };
    } else {
        try {
            await user.events.push({year : dateYear, month : dateMonth, day : dateDay, events : [{startTime : startTime, endTime : endTime, location : location, address : address, coor : coor, description : description}]});
            await user.save();
            return res.json({message : "Event added succesfully"});
        } catch(err) {
            return next(new Error("Unknown error, please try again"));
        };
    };
});

/*
router.patch("/editscheduledevent/:UID", async (req,res,next) => {
    let {date, startTime, endTime, description} = req.body;
    let user;
    try {
        UsersDatabase.Users.findById(req.params.UID);
    } catch(err) {
        return next(new Error("User not Found"));
    }

}

router.delete("/deletescheduledevent/:UID")
*/

module.exports = router;

