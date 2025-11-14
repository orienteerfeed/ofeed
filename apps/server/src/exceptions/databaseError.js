class DatabaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DatabaseError';
    this.statusCode = 500;
  }
}

export default DatabaseError;
