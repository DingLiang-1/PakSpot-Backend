const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema({
    companyName : {
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
        ref : "BusinessPost"
    }],
});

const businessPostSchema = new mongoose.Schema({
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
    images : [{type:String}],
    creator : {type : mongoose.Types.ObjectId, required : true, ref : "Business"}
});

const BusinessPosts = mongoose.model("BusinessPost", businessPostSchema);
const Businesses = mongoose.model("Business", businessSchema);

exports.Businesses = Businesses;
exports.BusinessPosts = BusinessPosts;