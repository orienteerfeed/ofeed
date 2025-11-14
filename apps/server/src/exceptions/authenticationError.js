class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

export default AuthenticationError;
