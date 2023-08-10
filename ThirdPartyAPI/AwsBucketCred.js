const { S3Client } = require("@aws-sdk/client-s3");
const accessKey = process.env.ACCESS_KEY;
const bucketRegion = process.env.BUCKET_REGION;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
    credentials:{
        accessKeyId : accessKey,
        secretAccessKey : secretAccessKey
    },
    region: bucketRegion
});

module.exports = s3;