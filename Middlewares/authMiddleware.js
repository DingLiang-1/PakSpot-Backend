const jwt = require("jsonwebtoken");


function validateAuthToken(req,res,next) {
    if (req.method === "OPTIONS") {
        return next();
    };
    let token;
    try {
        token = req.headers.authorization.split(" ")[1];
        if (!token) {
            return next(new Error("Authentication failed!"));
        };
        const decodedToken = jwt.verify(token, "please_dont_hack");
        req.userData = {userId: decodedToken.userId};
        next();
    } catch(err) {
        return next(new Error("Unknown Error Occured please try again!"));
    };
};

module.exports = validateAuthToken;
