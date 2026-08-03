/**
 * Async route handler wrapper.
 * try-catch boilerplate'ini ortadan kaldırır.
 * @param {Function} fn — async (req, res, next) => {}
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

export default asyncHandler;
