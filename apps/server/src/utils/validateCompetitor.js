import { body, check, oneOf, validationResult } from 'express-validator';
import { isExternalIdUnique } from './competitorUtils.js';
import { formatErrors } from './errors.js';
import { validation as validationResponse } from './responseApi.js';
import prisma from './context.js';

const validInputOrigin = ['START', 'FINISH', 'OFFICE', 'IT'];

const commonValidations = [
  check('classId')
    .optional({ nullable: true })
    .isNumeric()
    .withMessage('Class ID must be a number')
    .custom(async (value) => {
      if (value) {
        const existingClass = await prisma.class.findUnique({
          where: { id: value },
        });
        if (!existingClass)
          throw new Error('Class ID does not exist in the database');
      }
      return true;
    }),

  check('firstname')
    .optional({ nullable: true })
    .isString()
    .withMessage('First name must be a string')
    .isLength({ max: 255 })
    .withMessage('First name can be at most 255 characters long'),

  check('lastname')
    .optional({ nullable: true })
    .isString()
    .withMessage('Last name must be a string')
    .isLength({ max: 255 })
    .withMessage('Last name can be at most 255 characters long'),

  body('origin')
    .not()
    .isEmpty()
    .withMessage('Origin is required')
    .isIn(validInputOrigin)
    .withMessage('Invalid origin'),

  check('bibNumber')
    .optional({ nullable: true })
    .isInt()
    .withMessage('Bib number must be an integer'),

  check('nationality')
    .optional({ nullable: true })
    .isString()
    .isLength({ min: 3, max: 3 })
    .withMessage('Nationality must be a 3-letter country code'),

  check('registration')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 10 })
    .withMessage('Registration can be at most 10 characters long'),

  check('license')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 1 })
    .withMessage('License must be 1 character'),

  check('organisation')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 255 })
    .withMessage('Organisation can be at most 255 characters long'),

  check('shortName')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 10 })
    .withMessage('Short name can be at most 10 characters long'),

  check('card')
    .optional({ nullable: true })
    .isInt()
    .withMessage('Card must be an integer'),

  check('startTime')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Start time must be a valid datetime'),

  check('finishTime')
    .optional({ nullable: true })
    .isISO8601()
    .withMessage('Finish time must be a valid datetime'),

  check('time')
    .optional({ nullable: true })
    .isInt()
    .withMessage('Time must be an integer'),

  check('teamId')
    .optional({ nullable: true })
    .isInt()
    .withMessage('Team ID must be an integer')
    .custom(async (value) => {
      if (value) {
        const existingTeam = await prisma.team.findUnique({
          where: { id: value },
        });
        if (!existingTeam)
          throw new Error('Team ID does not exist in the database');
      }
      return true;
    }),

  check('leg')
    .optional({ nullable: true })
    .isInt()
    .withMessage('Leg must be an integer'),

  check('status')
    .optional()
    .isIn([
      'OK',
      'Finished',
      'MissingPunch',
      'Disqualified',
      'DidNotFinish',
      'Active',
      'Inactive',
      'OverTime',
      'SportingWithdrawal',
      'NotCompeting',
      'Moved',
      'MovedUp',
      'DidNotStart',
      'DidNotEnter',
      'Cancelled',
    ])
    .withMessage(
      'Status must be one of OK, Finished, MissingPunch, Disqualified, DidNotFinish, Active, Inactive, OverTime, SportingWithdrawal, NotCompeting, Moved, MovedUp, DidNotStart, DidNotEnter, Cancelled',
    ),

  check('lateStart')
    .optional()
    .isBoolean()
    .withMessage('Late start must be a boolean'),

  check('note')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 255 })
    .withMessage('Note can be at most 255 characters long'),

  check('externalId')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 191 })
    .withMessage('External ID can be at most 191 characters long'),

  body('splits').optional().isArray().withMessage('splits must be an array'),

  body('splits.*.controlCode')
    .if(body('splits').exists())
    .isInt()
    .withMessage('Each split must have an integer controlCode'),

  body('splits.*.time')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) return true;
      if (Number.isInteger(value)) return true;
      throw new Error('Each split.time must be an integer, null, or undefined');
    }),
];

// Validation middleware for creating a competitor (requires specific fields)
export const validateCreateCompetitor = [
  oneOf(
    [
      check('classId')
        .not()
        .isEmpty()
        .withMessage('Class ID is required')
        .isNumeric()
        .withMessage('Class ID must be a number'),

      check('classExternalId')
        .not()
        .isEmpty()
        .withMessage('Class External ID is required')
        .isString()
        .isLength({ max: 191 })
        .withMessage('Class External ID must be a string of max length 191'),
    ],
    'Either classId or classExternalId must be provided',
  ),

  body().custom((value, { req }) => {
    const { classId, classExternalId } = req.body;

    if (classId && classExternalId) {
      throw new Error(
        'Only one of classId or classExternalId should be provided, not both.',
      );
    }

    return true;
  }),

  check('firstname').not().isEmpty().withMessage('First name is required'),

  check('lastname').not().isEmpty().withMessage('Last name is required'),

  check('externalId')
    .optional({ nullable: true })
    .isString()
    .isLength({ max: 191 })
    .withMessage('External ID can be at most 191 characters long')
    .bail()
    .custom(async (externalId, { req }) => {
      if (externalId) {
        const eventId = req.params.eventId; // assuming you send eventId in the body
        const isUnique = await isExternalIdUnique(eventId, externalId);
        if (!isUnique) {
          throw new Error('External ID must be unique per event.');
        }
      }
      return true;
    }),

  ...commonValidations,

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    next();
  },
];

// Validation middleware for updating a competitor (only requires origin, other fields are optional)
export const validateUpdateCompetitor = [
  body('origin')
    .not()
    .isEmpty()
    .withMessage('Origin is required')
    .isIn(validInputOrigin)
    .withMessage('Invalid origin'),

  ...commonValidations,

  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json(validationResponse(formatErrors(errors)));
    }
    next();
  },
];
