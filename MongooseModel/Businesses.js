const mongoose = require("mongoose");

const businessPostSchema = new mongoose.Schema({
    
    location: {
        type: String,
        required: true
    },
    
    address: {
        type: String,
        required: true
    },
    
    coor: {
        lat: {
            type: String,
            required: true
        },
        lng: {
            type: String,
            required: true
        }
    },
    
    images: [
        {
            type: String
        }
    ],

    description: {
        type: String 
    },
    
    tags: [
        {
            type: String,
            index: true
        }
    ],
    
    creator : {
        type: mongoose.Types.ObjectId, 
        required: true, 
        ref: "Business"
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
    ]
});

const businessSchema = new mongoose.Schema({
    
    username: {
        type: String,
        required: true
    },
    
    password: {
        type : String,
        required: true
    
    },
   
    email: {
        type:String,
        index: true,
        required: true
        
    },
    
    profilePicture : {
        type: String,
        required: true
    },
   
    posts: [
        {
            type : mongoose.Types.ObjectId,
            required : true,
            ref : "BusinessPost",
        }
    ],
    
    bookmarked: [
        {
            postId: {
                type: mongoose.Types.ObjectId,
                required: true,
                refPath: "bookmarked.postModel"
            },
            
            postModel:  {
                type: String, 
                required: true, 
                enum: ['UserPost', 'BusinessPost']
            }
        }
    ],
    resetCache : {
        type: String
    }
});


const BusinessPosts = mongoose.model("BusinessPost", businessPostSchema);
const Businesses = mongoose.model("Business", businessSchema);

exports.Businesses = Businesses;
exports.BusinessPosts = BusinessPosts;
