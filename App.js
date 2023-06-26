const express = require("express");
const bodyParser = require("body-parser");
const https = require("https");
const mongoose = require("mongoose");
const app = express();

const UserRoutes = require("./routes/UserRoutes.js");
const SharedRoutes = require("./routes/SharedRoutes.js");



app.use(express.static("Public"));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use((req,res,next) => {
    res.setHeader("Access-Control-Allow-Origin","*");
    res.setHeader("Access-Control-Allow-Headers","Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.setHeader("Access-Control-Allow-Methods","GET", "POST", "PATCH", "DELETE");
    next();
});

app.use("/shared", SharedRoutes);
app.use("/users", UserRoutes);



app.use((error,req,res,next) => {
    if (res.headerSent) {
        next(error);
    } else {
        res.status(error.code || 500).json({error :error.message || "An unknown error occured"});
    };
});

mongoose
    .connect(
        `mongodb+srv://${process.env.DB_USER}:%40${process.env.DB_PASSWORD}@pakspot.qunuqw4.mongodb.net/${process.env.DB_NAME}`, { useNewUrlParser : true }
    )
    .then(() => {
        app.listen(process.env.PORT || 3000, () => {
            console.log("server started at port 3000");
        })
    })
    .catch(err => {
        console.log(err);
    });
;




