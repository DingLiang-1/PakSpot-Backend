const Multer = require("multer");

const multer = Multer({
    storage: Multer.memoryStorage(),
    limits : {
        fileSize: 100 * 1024 * 1024,
    },
});

module.exports = multer;