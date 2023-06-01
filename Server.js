const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const mongoose = require("mongoose");
const app = express();

app.use(express.static("Public"));
app.use(bodyParser.urlencoded({extended: true}));
mongoose.connect("mongodb+srv://DingLiang:%400130756d@pakspot.qunuqw4.mongodb.net/PakspotDB", { useNewUrlParser : true });

const userCredSchema = new mongoose.Schema({
    username: {
        type:String,
        required:true
    },
    password: {
        type : String,
        required: true
    }
});

const userCred = mongoose.model("userCred", userCredSchema);

app.post("/register",function(req,res) {
    const username = req.body.username;
    const passwordFirst = req.body.passwordFirst;
    const passwordSecond = req.body.passwordSecond;
    if (passwordFirst === passwordSecond) {
        const newUser = new userCred({
            username : req.body.email,
            password : req.body.passwordFirst
        });
        newUser.save();
        res.redirect("/login");
    } else {
        res.redirect("/register");
    }
});

app.get("/register", function(req,res) {
    res.sendFile(__dirname + "/Register.html");
});

app.get("/login",function(req,res) {
    res.sendFile(__dirname + "/Login.html");
});

app.post("/login",function(req,res) {
    const username = req.body.email;
    const password = req.body.password;
    userCred.find({username : username, password : password})
        .then(function(data) {
            if (data.length) {
                res.redirect("/");
            } else {
                res.redirect("/login");
            }
        })
        .catch(function (err) {
            res.redirect("/login")
        }); 
}); 

app.post("/noAccount", function (req,res) {
    res.redirect("/register");
});

app.post("/gotAccount", function (req,res) {
    res.redirect("/login");
});

app.get("/",function(req,res) {
    res.sendFile(__dirname + "/HomePage.html");
});

app.get("/planner", function(req,res) {
    res.sendFile(__dirname + "/Planner.html");
});

app.post("/", function(req,res) {
    res.sendFile(__dirname + "/HomePage.html");
});

app.post("/homeIcon", function(req,res) {
    res.redirect("/");
});

app.post("/searchIcon", function(req,res) {
    res.redirect("/");
});

app.post("/postIcon", function(req,res) {
    res.redirect("/");
});

app.post("/plannerIcon", function(req,res) {
    res.redirect("/planner");
});


app.listen(process.env.PORT || 3000, function(){
    console.log("server started at port 3000");
});




