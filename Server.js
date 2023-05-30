const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const app = express();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));

app.get("/",function(req,res) {
    res.sendFile(__dirname + "/HomePage.html");
});

app.post("/", function(req,res) {
    res.sendFile(__dirname + "/HomePage.html");

});


app.listen(process.env.PORT || 3000, function(){
    console.log("server started at port 3000");
});




