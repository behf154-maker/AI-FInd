const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

const hasCloudinaryConfig =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  !!process.env.CLOUDINARY_API_KEY &&
  !!process.env.CLOUDINARY_API_SECRET;

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const buildLocalUrl = (filePath) => {
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  const relativePath = path.relative(uploadsDir, filePath).replace(/\\/g, '/');
  const baseUrl = process.env.APP_BASE_URL || '';
  const prefix = baseUrl || `http://localhost:${process.env.PORT || 3000}`;
  return `${prefix}/uploads/${relativePath}`;
};

const removeLocalFile = (filePath) => {
  fs.unlink(filePath, (err) => {
    if (err) {
      console.warn('Could not delete temp file:', filePath, err.message);
    }
  });
};

const uploadImage = async (filePath) => {
  try {
    if (hasCloudinaryConfig) {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'ai-lost-and-found',
        use_filename: true,
        unique_filename: true,
      });
      removeLocalFile(filePath);
      return result.secure_url;
    }

    // Fallback to serving from local uploads directory
    return buildLocalUrl(filePath);
  } catch (error) {
    console.error('Image upload failed, falling back to local storage:', error.message);
    return buildLocalUrl(filePath);
  }
};

module.exports = {
  uploadImage,
};

