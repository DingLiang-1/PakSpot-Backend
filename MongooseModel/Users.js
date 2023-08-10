const mongoose = require("mongoose");

const subUserDayEventSchema = new mongoose.Schema({
    startTime : {
        type: String,
        required: true,
    },
    endTime : {
        type: String,
        required: true
    },
    location : {
        type: String,
        required: true
    },
    address : {
        type: String,
        required: true
    },
    coor : {
        lat : {
            type: String,
            required: true
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
    events : [
        {
            type: subUserDayEventSchema, 
            default : []
        }
    ]
});

const userPostSchema = new mongoose.Schema({
    location : {
        type : String,
        required : true
    },
    address : {
        type : String,
        required : true
    },
    coor : {
        lat : {
            type : String,
            required: true
        },
        lng : {
            type : String,
            required :true
        }
    },
    images: [
        {
            type : String
        }
    ],
    description: {
        type : String 
    },
    tags: [
        {
            type : String
        }
    ],
    creator : {
        type : mongoose.Types.ObjectId, 
        required : true, 
        ref: 'User'
    },

    likedBy: [
        {
            doc: {
                type: mongoose.Types.ObjectId,
                required: true,
                refPath: 'likedBy.docModel'
            },
        
            docModel: {
                type: String,
                required: true,
                enum: ['User', 'Business']
            }
        }
    ],

    comments: [
        {
            body: {
                type: String,
                required: true
            },
        
            doc: {
                type: mongoose.Types.ObjectId,
                required: true,
                refPath: 'comments.docModel'
            },
        
            docModel: {
                type: String,
                required: true,
                enum: ['User', 'Business']
            },

            likedBy: [
                {
                    doc: {
                        type: mongoose.Types.ObjectId,
                        required: true,
                        refPath: 'comments.likedBy.docModel'
                    },

                    docModel: {
                        type: String,
                        required: true,
                        enum: ['User', 'Business']
                    }
                }
            ],

            replies: [
                {
                    body: {
                        type: String,
                        required: true
                    },
                
                    doc: {
                        type: mongoose.Types.ObjectId,
                        required: true,
                        refPath: 'comments.replies.docModel'
                    },
                
                    docModel: {
                        type: String,
                        required: true,
                        enum: ['User', 'Business']
                    }
                }
            ]
        }
    ],

    postType: {
        type: String,
        required: true
    }
});

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    password: {
        type : String,
        required: true
    
    },
    email: {
        type: String,
        required: true,
        index: true
    },
    profilePicture : {
        type: String,
        required: true
    },
    posts : [
        {
         type : mongoose.Types.ObjectId,
         required : true,
         ref : "UserPost"
        }
    ],
    events : [
        {
            type: userEventSchema,
            default: []
        }
    ],
    bookmarked : [
        {
            postId: {
                type: mongoose.Types.ObjectId,
                required: true,
                refPath: 'bookmarked.postModel'
            },
        
            postModel: {
                type: String, 
                required: true, 
                enum: ['UserPost', 'BusinessPost']
            }
        }
    ],
    resetCache : {
        type: String
    },
    public : {
        type:Boolean,
        required:true
    }
});


const UserPosts = mongoose.model("UserPost", userPostSchema);
const Users = mongoose.model("User", userSchema);


exports.Users = Users;
exports.UserPosts = UserPosts;