module.exports = {
  Canvas: class Canvas {},
  Image: class Image {},
  ImageData: class ImageData {},
  Path2D: class Path2D {},
  createCanvas: () => ({
    getContext: () => null,
  }),
  loadImage: async () => ({ width: 0, height: 0 }),
};
