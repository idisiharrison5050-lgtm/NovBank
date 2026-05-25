var cloudinary = require('cloudinary').v2;
var { CloudinaryStorage } = require('multer-storage-cloudinary');
var multer = require('multer');

cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET
});

var storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder:         'novbank-kyc',
    allowed_formats: ['jpg', 'jpeg', 'png', 'pdf'],
    transformation: [{ width: 1200, crop: 'limit' }]
  }
});

var upload = multer({ storage: storage });

module.exports = { cloudinary, upload };