const mongoose = require("mongoose");

const subUserDayEventSchema = new mongoose.Schema({
    startTime : {
        type:String,
        required:true,
    },
    endTime : {
        type:String,
        required:true
    },
    location : {
        type :String,
        required:true
    },
    address : {
        type :String,
        required:true
    },
    coor : {
        lat : {
            type:String,
            required:true
        },
        lng : {
            type:String,
            required:true
        }
    },
    description : {
        type : String,
        required : true
    }
});

const userEventSchema = new mongoose.Schema({
    year : {
        type : String,
        required : true
    }, 
    month : {
        type : String,
        required : true
    },
    day : {
        type : String,
        required : true
    }, 
    events : [{type:subUserDayEventSchema, default : []}]
});


const userSchema = new mongoose.Schema({
    username: {
        type:String,
        required:true
    },
    password: {
        type : String,
        required: true
    
    },
    email: {
        type:String,
        required: true
    },
    posts : [{
        type : mongoose.Types.ObjectId,
        required: true,
        ref : "UserPost"
    }],
    events : [{type:userEventSchema,default : []}]
});

const userPostSchema = new mongoose.Schema({
    location : {
        type :String,
        required : true
    },
    address : {
        type : String,
        required : true
    },
    coor : {
        lat : {
            type : String,
            required:true
        },
        lng : {
            type : String,
            required : true
        }
    },
    /*images : [{type:String}], */
    creator : {type : mongoose.Types.ObjectId, required : true, ref : "User"}
});



const Users = mongoose.model("User", userSchema);
const UserPosts = mongoose.model("UserPost", userPostSchema);

exports.Users = Users;
exports.UserPosts = UserPosts;