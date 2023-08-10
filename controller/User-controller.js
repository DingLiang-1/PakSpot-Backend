const express = require('express');
const mongoose = require("mongoose");

const getCoorForAddress = require("../ThirdPartyAPI/GoogleMap.js");
const UsersDatabase = require("../MongooseModel/Users.js");

const HttpError = require('../models/http-error.js');


const getScheduledEvents = async (req, res, next) => {
    const { month, year } = req.body;
    let user;
    let eventsMonth;

    try {
        user = await UsersDatabase.Users.findById(req.params.UID);
        
        if (!user) {
            throw new HttpError('Cannot Find User', 404);
        }

        eventsMonth = await user.events.filter(docs => {
            return docs.year === year && docs.month === month
        });

        if (eventsMonth.length) {
            return res.status(200).json({
                events: eventsMonth
            });
        } else {
            return res.status(200).json({
                events: []
            });
        }
    } catch (err) {
        return next(new HttpError(err.message || "Unknown Error Occurred", err.code || 404));
    }
}

const addScheduledEvent = async (req, res, next) => {
    let {location, address, date, startTime, endTime, description} = req.body;
    let coor;
    
    try {
        coor = await getCoorForAddress(address);
    } catch(err) {
        return next(new HttpError("Could Not Get Coordinates For Address", 404));
    };

    let user;
    try {
        user = await UsersDatabase.Users.findById(req.params.UID);
    } catch(err) {
        return next(new HttpError(err.message || "Unknown Error Occured While Fetching User",
            err.code || 404));
    };
    
    if (!user) {
        return next(new HttpError("User not found, please try again", 404));
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
};

const editScheduleEvent = async (req, res, next) => {
    let { date, startTime, endTime, description, eventId, eventDayId } = req.body;
    let user;
    let eventDayLength;
    let origEvent;
    
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        user = await UsersDatabase.Users.findById(req.params.UID).session(sess);

        if (!user) {
            throw new HttpError("Cannot Find User", 404);
        }
        origEvent = {
            ...user.events.id(eventDayId).events.id(eventId)
        };
        await user.events.id(eventDayId).events.pull(eventId);
        await user.save({ session: sess });
        eventDayLength = await user.events.id(eventDayId).events.length;

        if (!eventDayLength) { 
            await user.events.pull(eventDayId);
            await user.save({session: sess});
        };
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
                    await user.events.id(datePresent[0]._id).events.push({...origEvent, startTime : startTime, endTime : endTime, description : description});
                    await user.save({session: sess});
                } catch(err) {
                    return next(new Error("Unknown error, please try again"));
                };
            };
        } else {
            try {
                await user.events.push({year : dateYear, month : dateMonth, day : dateDay, events : [{...origEvent, startTime : startTime, endTime : endTime, description : description}]});
                await user.save({session: sess});
            } catch(err) {
                return next(new Error("Unknown error, please try again"));
            };
        };
        await sess.commitTransaction();
        await sess.endSession();
    } catch(err) {
        return next(new HttpError(err.message || "An unknown error occured, please try again", err.code || 404));
    }
    return res.status(200).json({
        message : "Event updated succesfully"
    });
}

const deleteScheduledEvent = async (req, res, next) => {
    let { eventDayId, eventId } = req.body;
    let user;
    let eventDayLength;
    
    try {
        const sess = await mongoose.startSession();
        sess.startTransaction();
        user = await UsersDatabase.Users.findById(req.params.UID).session(sess);

        if (!user) {
            throw new HttpError("Cannot Find User", 404);
        }
        await user.events.id(eventDayId).events.pull(eventId);
        await user.save({session : sess});
        eventDayLength = await user.events.id(eventDayId).events.length;
        if (!eventDayLength) { 
            await user.events.pull(eventDayId);
            await user.save({session : sess});
        };
        await sess.commitTransaction();
        await sess.endSession();
    } catch(err) {
        return next(new HttpError(err.message || "Unknown Error Occured", err.code || 404));
    };
    return res.status(200).json({
        message : "Event deleted succesfully"
    });
}

exports.getScheduledEvents = getScheduledEvents;
exports.addScheduledEvent = addScheduledEvent;
exports.editScheduleEvent = editScheduleEvent;
exports.deleteScheduledEvent = deleteScheduledEvent;



