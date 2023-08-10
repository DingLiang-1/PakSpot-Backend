const axios = require("axios");

async function getCoorForAddress(address) {
    const response = await axios.get(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_API_KEY}`);
    const data = response.data;
    if (!data || data.status === "ZERO_RESULTS") {
        throw new Error("Invalid Address");
    }
    const coor = data.results[0].geometry.location;
    return coor;
};

module.exports = getCoorForAddress;
