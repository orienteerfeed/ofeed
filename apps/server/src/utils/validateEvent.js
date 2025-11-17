import { check, validationResult } from 'express-validator';
import prisma from './context.js';
import { formatErrors } from './errors.js';
import { validation as validationResponse } from './responseApi.js';

// Middleware pro validaci
const validateEvent = [
  // Validate 'sportId' to check if it exists in the 'sport' table
  check('sportId')
    .not()
    .isEmpty()
    .withMessage('Sport ID is required')
    .isNumeric()
    .withMessage('Sport ID must be a number')
    .custom(async value => {
      const sport = await prisma.sport.findUnique({
        where: { id: value },
      });
      if (!sport) {
        throw new Error('Sport ID does not exist in the database');
      }
      return true;
    }),

  // Validate 'name' - must be a string with max length of 255 characters
  check('name')
    .not()
    .isEmpty()
    .withMessage('Name is required')
    .isString()
    .withMessage('Name must be a string')
    .isLength({ max: 255 })
    .withMessage('Name can be at most 255 characters long'),

  // Validate 'date' - must be a date without time component
  check('date')
    .not()
    .isEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date')
    .custom(value => {
      const dateObj = new Date(value);
      if (isNaN(dateObj.getTime()) || value.length > 10) {
        // Ensures only date without time is provided
        throw new Error('Date must be in YYYY-MM-DD format (no time component)');
      }
      return true;
    }),

  // Validate 'timezone' - must be a valid IANA timezone
  check('timezone')
    .not()
    .isEmpty()
    .withMessage('Timezone is required')
    .isString()
    .withMessage('Timezone must be a string'),

  // Validate 'organizer' - must be a string with max length of 255 characters
  check('organizer')
    .not()
    .isEmpty()
    .withMessage('Organizer is required')
    .isString()
    .withMessage('Organizer must be a string')
    .isLength({ max: 255 })
    .withMessage('Organizer can be at most 255 characters long'),

  // Validate 'location' - must be a string with max length of 255 characters
  check('location')
    .not()
    .isEmpty()
    .withMessage('Location is required')
    .isString()
    .withMessage('Location must be a string')
    .isLength({ max: 255 })
    .withMessage('Location can be at most 255 characters long'),

  // Validate 'latitude' - must be a number between -90 and 90
  check('latitude')
    .optional({ nullable: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a number between -90 and 90'),

  // Validate 'longitude' - must be a number between -180 and 180
  check('longitude')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a number between -180 and 180'),

  // Validate 'zeroTime' - must be a valid datetime object
  check('zeroTime')
    .not()
    .isEmpty()
    .withMessage('ZeroTime is required')
    .isISO8601()
    .withMessage('ZeroTime must be a valid datetime'),

  // Validate 'relay' - must be a boolean, defaults to false
  check('relay').optional().isBoolean().withMessage('Relay must be a boolean').default(false),

  // Validate 'hundredthPrecision' - must be a boolean
  check('hundredthPrecision')
    .optional()
    .isBoolean()
    .withMessage('HundredthPrecision must be a boolean (true/false)'),

  // Validate 'published' - must be a boolean, defaults to false
  check('published')
    .optional()
    .isBoolean()
    .withMessage('Published must be a boolean')
    .default(false),

  // Validate 'ranking' - must be a boolean, defaults to false
  check('ranking').optional().isBoolean().withMessage('Ranking must be a boolean').default(false),

  // Validate 'startMode' - must be one of the allowed values
  check('startMode')
    .optional()
    .isIn(['Individual', 'Mass', 'Handicap', 'Pursuit', 'Wave', 'ScoreO'])
    .withMessage('Start mode must be one of Individual, Mass, Handicap, Pursuit, Wave, ScoreO')
    .default('Individual'),

  // Validate 'coefRanking' - must be a float, optional, defaults to null
  check('coefRanking')
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage('Coefficient ranking must be a float value greater than or equal to 0')
    .default(null),

  // Validate 'countryCode' - must exist in the 'country' table by its primary key 'countryCode'
  check('countryCode')
    .not()
    .isEmpty()
    .isString()
    .withMessage('Country must be a string')
    .custom(async value => {
      const country = await prisma.country.findUnique({
        where: { countryCode: value },
      });
      if (!country) {
        throw new Error('Country does not exist in the database');
      }
      return true;
    }),
  // Middleware pro zpracování chyb
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    next();
  },
];

export default validateEvent;
