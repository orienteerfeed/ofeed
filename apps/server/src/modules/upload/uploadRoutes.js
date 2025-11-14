import { PrismaClient } from '@prisma/client';
import { DOMParser } from '@xmldom/xmldom';
import { Router } from 'express';
import { check, validationResult } from 'express-validator';
import multer from 'multer';
import fetch from 'node-fetch';
import { Parser } from 'xml2js';

import { formatErrors } from '../../utils/errors.js';
import { createShortCompetitorHash } from '../../utils/hashUtils.js';
import { verifyJwtToken } from '../../utils/jwtToken.js';
import { normalizeValue } from '../../utils/normalize.js';
import { calculateCompetitorRankingPoints } from '../../utils/ranking.js';
import { error, success, validation } from '../../utils/responseApi.js';
import {
  publishUpdatedCompetitor,
  publishUpdatedCompetitors,
} from '../../utils/subscriptionUtils.js';
import { notifyWinnerChanges } from './../event/winnerCache.js';
import { storeCzechRankingData } from './uploadService.js';

const router = Router();
const prisma = new PrismaClient();
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single('file');
const parser = new Parser({ attrkey: 'ATTR', trim: true });
const IOF_XML_SCHEMA =
  'https://raw.githubusercontent.com/international-orienteering-federation/datastandard-v3/master/IOF.xsd';

// Utility functions
/**
 * Fetches the IOF XML schema.
 *
 * This function makes a GET request to the IOF_XML_SCHEMA URL using the Fetch API,
 * with a header of "Content-Type: application/xml". If the request is successful,
 * it returns the body of the response as text. If an error occurs, it logs an error
 * message to the console.
 *
 * @returns {Promise<string|undefined>} A promise that resolves to the IOF XML schema as a string,
 * or undefined if an error occurs.
 */
async function fetchIOFXmlSchema() {
  try {
    const response = await fetch(IOF_XML_SCHEMA, {
      method: 'get',
      headers: { 'Content-Type': 'application/xml' },
    });
    return await response.text();
  } catch (err) {
    console.error('Problem to load IOF XML schema: ', err.message);
  }
}

/**
 * Retrieves the competitor key based on the provided class ID and person object.
 *
 * @param {string} classId - The class ID associated with the competitor.
 * @param {Object} person - The person object containing identification and name details.
 * @param {Array} person.Id - An array of identification objects.
 * @param {Object} person.Id[].ATTR - Attributes of the identification object.
 * @param {string} person.Id[].ATTR.type - The type of the identification.
 * @param {string} person.Id[] - The identification value.
 * @param {Array} person.Name - An array of name objects.
 * @param {Array} person.Name[].Family - An array containing family names.
 * @param {Array} person.Name[].Given - An array containing given names.
 *
 * @returns {string} - The competitor key, either an ID or a hash created from the family and given names.
 */
function getCompetitorKey(classId, person, keyType = 'registration') {
  try {
    // Ensure `person` and `person.Id` are valid
    if (!person || !Array.isArray(person.Id) || person.Id.length === 0) {
      console.warn(
        'Invalid person data or missing IDs:',
        JSON.stringify(person, null, 2),
      );
      return fallbackToNameHash(classId, person);
    }

    // Handle "registration" key type
    if (keyType === 'registration') {
      // Use the first valid ID with type "CZE" or any other ID if "CZE" is not available
      const id =
        person.Id.find(
          (sourceId) =>
            sourceId.ATTR?.type === 'CZE' &&
            sourceId._ &&
            sourceId._.trim() !== '',
        )?._ ||
        person.Id.find((sourceId) => sourceId._ && sourceId._.trim() !== '')?._;

      if (id) return id; // Return ID if available
      console.warn('No valid registration ID found for person:', person);
      return fallbackToNameHash(classId, person);
    }

    // Handle "system" key type
    else if (keyType === 'system') {
      // Prioritize the ID with type "QuickEvent", fallback to other IDs
      const quickEventId = person.Id.find(
        (sourceId) => sourceId.ATTR?.type === 'QuickEvent',
      );
      const orisId = person.Id.find(
        (sourceId) => sourceId.ATTR?.type === 'ORIS',
      );
      const id = quickEventId?._ || orisId?._ || person.Id[0]?._; // Prioritize QuickEvent, then ORIS, then fallback to the first ID

      if (id) return id; // Return ID if available
      console.warn('No valid system ID found for person:', person);
      return fallbackToNameHash(classId, person);
    }

    // Handle unknown key types
    else {
      console.error(`Unknown keyType "${keyType}" provided.`);
      return fallbackToNameHash(classId, person);
    }
  } catch (error) {
    // Catch unexpected errors and log them
    console.error('Error in getCompetitorKey:', error);
    return fallbackToNameHash(classId, person);
  }
}

// Fallback function to generate a competitor hash using names
/**
*
* @param {string} classId - The class ID associated with the competitor.
* @param {Object} person - The person object containing identification and name details.
 * @returns {string} - Unique competitor's id
 */
function fallbackToNameHash(classId, person) {
  const familyName = person?.Name?.[0]?.Family?.[0] || '';
  const givenName = person?.Name?.[0]?.Given?.[0] || '';
  if (!familyName || !givenName) {
    console.warn(
      'Missing family or given name for fallback hash generation:',
      person,
    );
  }
  return createShortCompetitorHash(classId, familyName, givenName);
}

/**
 * Parses the XML content from the request file buffer.
 *
 * @param {Object} buffer - The buffer object containing the file buffer.
 * @returns {Promise<Object>} - A promise that resolves to the parsed XML object.
 * @throws {Error} - Throws an error if parsing fails.
 */
async function parseXml(buffer) {
  /** This function takes in two parameters, a request object and a callback function.
   * It attempts to parse the buffer of the file contained in the request object using the parser.parseStringPromise() method.
   * If successful, it calls the callback function with null as the first parameter and iofXml3 as the second parameter.
   * If an error occurs, it logs it to the console and calls the callback function with err as its only parameter.  */
  try {
    return await parser.parseStringPromise(buffer.toString());
  } catch (err) {
    console.error(err);
    throw new Error('Error parsing file: ' + err.message);
  }
}

/**
 * Checks if the JSON object contains any of the specified XML types and returns an array of objects with information about the matching keys.
 *
 * @param {Object} json - The JSON object to check.
 * @returns {Array<Object>} An array of objects containing information about the matching keys in the JSON object.
 * @returns {boolean} return[].isArray - Indicates if the value is an array.
 * @returns {string} return[].jsonKey - The key in the JSON object that matches the XML type.
 * @returns {any} return[].jsonValue - The value associated with the matching key in the JSON object.
 */
const checkXmlType = (json) => {
  /**
   * checkXmlType() is a function that takes in a JSON object as an argument and returns an array of objects.
   * The function checks if the JSON object contains any of the values in the iofXmlTypes array, and if so,
   * it pushes an object containing the key, value, and whether or not it is an array into the response array.
   * The returned response array will contain objects with information about any keys in the JSON object that match
   * any of the values in the iofXmlTypes array. */
  const iofXmlTypes = ['ResultList', 'StartList', 'CourseData'];
  return Object.entries(json)
    .filter(([key]) => iofXmlTypes.includes(key))
    .map(([key, value]) => ({ isArray: true, jsonKey: key, jsonValue: value }));
};

/**
 * Validates an XML string against an XSD string using WASM-based xmllint.
 *
 * @param {string} xmlString - The XML string to be validated.
 * @param {string} xsdString - The XSD string to validate against.
 * @returns {Promise<{ state: boolean, message: string }>} - An object containing the validation state and message.
 */
const validateIofXml = async (xmlString, xsdString) => {
  let returnState = { state: false, message: '' };
  try {
    // First check if XML is well-formed
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

    const parseErrors = xmlDoc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      returnState.message = 'XML parsing error: ' + parseErrors[0].textContent;
      console.log(returnState.message);
      return returnState;
    }

    // Validate against XSD using xmllint-wasm
    const result = await validateWithXMLLint({
      xml: xmlString,
      schema: xsdString
    });

    if (result.valid) {
      returnState.state = true;
    } else {
      // Convert xmllint errors to ValidationError format
      returnState.errors = result.errors ? result.errors.map(error => ({
        param: 'xml',
        msg: typeof error === 'string' ? error : error.message || 'Validation error',
        type: 'schema'
      })) : [{
        param: 'xml',
        msg: 'Validation failed',
        type: 'schema'
      }];
      console.log(returnState.message);
    }
  } catch (err) {
    returnState.message = err.message;
    console.error('Problem to validate xml: ', err.message);
  }
  return returnState;
};

/**
 * Retrieves an event by its ID from the database.
 *
 * @async
 * @function getEventById
 * @param {number} eventId - The ID of the event to retrieve.
 * @returns {Promise<Object|null>} The event object if found, otherwise null.
 * @throws {Error} If the event does not exist or there is a database error.
 */
async function getEventById(eventId) {
  try {
    return await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, relay: true, ranking: true, authorId: true },
    });
  } catch (err) {
    console.error(err);
    throw new Error(
      `Event with ID ${eventId} does not exist in the database: ${err.message}`,
    );
  }
}

/**
 * Retrieves a list of classes for a given event.
 *
 * @param {number} eventId - The ID of the event to retrieve classes for.
 * @returns {Promise<Array<{id: number, externalId: string}>>} A promise that resolves to an array of class objects, each containing an `id` and `externalId`.
 * @throws {Error} Throws an error if there is a database issue.
 */
async function getClassLists(eventId) {
  try {
    return await prisma.class.findMany({
      where: { eventId: eventId },
      select: { id: true, externalId: true },
    });
  } catch (err) {
    console.error(err);
    throw new Error(`Database error: ${err.message}`);
  }
}

/**
 * Upserts a class in the database based on the provided class details.
 *
 * @param {string} eventId - The ID of the event to which the class belongs.
 * @param {Object} classDetails - The details of the class to be upserted.
 * @param {Array} classDetails.Id - An array containing the class IDs.
 * @param {Array} classDetails.Name - An array containing the class names.
 * @param {Object} classDetails.ATTR - Additional attributes of the class.
 * @param {string} [classDetails.ATTR.sex] - The sex attribute of the class.
 * @param {Array} dbClassLists - The list of existing classes in the database.
 * @param {Object} [additionalData={}] - Additional data to be included in the class record.
 * @returns {Promise<string>} - The ID of the upserted class.
 */
async function upsertClass(
  eventId,
  classDetails,
  dbClassLists,
  additionalData = {},
) {
  const sourceClassId = classDetails.Id?.shift();
  const className = classDetails.Name.shift();
  const classIdentifier = sourceClassId || className;
  const existingClass = dbClassLists.find(
    (cls) => cls.externalId === classIdentifier,
  );

  // Determine sex based on the first letter of the class name
  const sex =
    className.charAt(0) === 'H' ? 'M' : className.charAt(0) === 'D' ? 'F' : 'B';

  if (!existingClass) {
    const dbClassInsert = await prisma.class.create({
      data: {
        eventId: eventId,
        externalId: classIdentifier,
        name: className,
        sex: classDetails.ATTR?.sex || sex,
        ...additionalData, // Spread additional properties like length, climb, etc.
      },
    });
    return dbClassInsert.id;
  } else {
    await prisma.class.update({
      where: { id: existingClass.id },
      data: {
        name: className,
        sex: classDetails.ATTR?.sex || sex,
        ...additionalData, // Update additional fields if present
      },
    });
    return existingClass.id;
  }
}

/**
 * Upserts a competitor in the database.
 *
 * This function checks if a competitor already exists in the database based on the provided
 * event ID, class ID, and person information. If the competitor exists, it updates the competitor's
 * information if there are any changes. If the competitor does not exist, it creates a new competitor
 * record in the database.
 *
 * @param {number} eventId - The ID of the event.
 * @param {number} classId - The ID of the class.
 * @param {Object} person - The person object containing competitor details.
 * @param {Object} organisation - The organisation object containing organisation details.
 * @param {Object|null} [start=null] - The start object containing start details (optional).
 * @param {Object|null} [result=null] - The result object containing result details (optional).
 * @param {number|null} [teamId=null] - The ID of the team (optional).
 * @param {number|null} [leg=null] - The leg number (optional).
 * @returns {Promise<Object>} - A promise that resolves to an object containing the competitor ID and a boolean indicating if the competitor was updated.
 */
async function upsertCompetitor(
  eventId,
  classId,
  person,
  organisation,
  start = null,
  result = null,
  teamId = null,
  leg = null,
) {
  const registration = getCompetitorKey(classId, person, 'registration');
  const externalId = getCompetitorKey(classId, person, 'system');
  const dbCompetitorResponse = await prisma.competitor.findFirst({
    where: { class: { eventId: eventId }, externalId: externalId },
    select: {
      id: true,
      class: true,
      classId: true,
      firstname: true,
      lastname: true,
      nationality: true,
      registration: true,
      license: true,
      organisation: true,
      shortName: true,
      card: true,
      bibNumber: true,
      startTime: true,
      finishTime: true,
      time: true,
      status: true,
      lateStart: true,
      team: true,
      leg: true,
      note: true,
      externalId: true,
    },
  });

  // Prepare new data, giving preference to already stored values for certain fields
  const competitorData = {
    class: { connect: { id: classId } },
    firstname: person.Name[0].Given[0],
    lastname: person.Name[0].Family[0],
    nationality: person.Nationality?.[0].ATTR.code,
    registration: registration,
    license: dbCompetitorResponse?.license || null,
    organisation: organisation?.Name?.[0],
    shortName: organisation?.ShortName?.[0],
    bibNumber: result?.BibNumber
      ? parseInt(result.BibNumber.shift())
      : start?.BibNumber
      ? parseInt(start.BibNumber.shift()) ?? dbCompetitorResponse?.bibNumber
      : null,
    startTime:
      (result?.StartTime?.shift() || start?.StartTime?.shift()) ??
      (dbCompetitorResponse?.startTime || null),
    finishTime:
      result?.FinishTime?.shift() ?? (dbCompetitorResponse?.finishTime || null),
    time: result?.Time
      ? parseInt(result.Time[0])
      : dbCompetitorResponse?.time ?? null,
    card: result?.ControlCard
      ? parseInt(result.ControlCard.shift())
      : start?.ControlCard
      ? parseInt(start.ControlCard.shift())
      : dbCompetitorResponse?.card ?? null,
    status:
      result?.Status?.toString() ??
      (dbCompetitorResponse?.status || 'Inactive'),
    lateStart: dbCompetitorResponse?.lateStart || false,
    team: teamId ? { connect: { id: teamId } } : undefined,
    leg: leg ? parseInt(leg) : undefined,
    externalId: externalId,
    note: dbCompetitorResponse?.note || null,
    updatedAt: new Date(),
  };

  if (!dbCompetitorResponse) {
    const dbCompetitorInsert = await prisma.competitor.create({
      data: competitorData,
    });
    try {
      await prisma.protocol.create({
        data: {
          eventId: eventId,
          competitorId: dbCompetitorInsert.id,
          origin: 'IT',
          type: 'competitor_create',
          previousValue: null,
          newValue: competitorData.lastname + ' ' + competitorData.firstname,
          authorId: 1,
        },
      });
    } catch (err) {
      console.error('Error creating protocol record:', err);
    }

    return { id: dbCompetitorInsert.id, updated: true };
  } else {
    // Compare existing data with new data (excluding preserved fields)
    const keysToCompare = [
      { key: 'classId', type: 'number' },
      { key: 'firstname', type: 'string' },
      { key: 'lastname', type: 'string' },
      { key: 'nationality', type: 'string' },
      { key: 'registration', type: 'string' },
      { key: 'organisation', type: 'string' },
      { key: 'shortName', type: 'string' },
      { key: 'bibNumber', type: 'number' },
      { key: 'startTime', type: 'date' },
      { key: 'finishTime', type: 'date' },
      { key: 'time', type: 'number' },
      { key: 'card', type: 'number' },
      { key: 'status', type: 'string' },
      { key: 'teamId', type: 'number' },
      { key: 'leg', type: 'number' },
    ];

    // Collect changes to be added to the protocol
    const changes = [];

    // Define a mapping of competitorData keys to their corresponding protocol types
    const keyToTypeMap = {
      classId: 'class_change',
      firstname: 'firstname_change',
      lastname: 'lastname_change',
      nationality: 'nationality_change',
      registration: 'registration_change',
      organisation: 'organisation_change',
      shortName: 'short_name_change',
      bibNumber: 'bibNumber_change',
      startTime: 'start_time_change',
      finishTime: 'finish_time_change',
      time: 'time_change',
      card: 'si_card_change',
      status: 'status_change',
      teamId: 'team_change',
      leg: 'leg_change',
    };

    // Check for differences and collect changes
    const isDifferent = keysToCompare.some(({ key, type }) => {
      const currentValue = normalizeValue(type, competitorData[key]);
      const previousValue = normalizeValue(type, dbCompetitorResponse[key]);
      const hasChanged =
        competitorData[key] !== undefined && currentValue !== previousValue;

      if (hasChanged && keyToTypeMap[key]) {
        changes.push({
          type: keyToTypeMap[key],
          previousValue: dbCompetitorResponse[key]?.toString() || null,
          newValue: competitorData[key]?.toString() || null,
        });
      }

      return hasChanged;
    });

    if (isDifferent) {
      // Update only if there is a difference
      await prisma.competitor.update({
        where: { id: dbCompetitorResponse.id },
        data: competitorData,
      });

      // Add records to protocol
      try {
        for (const change of changes) {
          await prisma.protocol.create({
            data: {
              eventId: eventId,
              competitorId: dbCompetitorResponse.id,
              origin: 'IT',
              type: change.type,
              previousValue: change.previousValue,
              newValue: change.newValue,
              authorId: 1,
            },
          });
        }
      } catch (err) {
        console.error('Failed to create protocol records:', err);
      }

      const updatedCompetitorData = {
        ...competitorData,
        id: dbCompetitorResponse.id,
      };
      await publishUpdatedCompetitor(eventId, updatedCompetitorData);
      return { id: dbCompetitorResponse.id, updated: true };
    }

    return { id: dbCompetitorResponse.id, updated: false };
  }
}

/**
 * Updates or inserts split times for a given competitor based on the provided result data.
 *
 * This function performs the following operations:
 * - Finds existing splits for the competitor in the database.
 * - Compares the incoming split times with the existing ones.
 * - Creates new splits for any incoming splits that do not exist in the database.
 * - Updates existing splits if their times differ from the incoming data.
 * - Deletes splits from the database that are not present in the incoming data.
 *
 * @async
 * @function upsertSplits
 * @param {number} competitorId - The ID of the competitor whose splits are being updated.
 * @param {Object} result - The result data containing split times.
 * @param {Array<Object>} result.SplitTime - An array of split time objects.
 * @param {Array<string>} [result.SplitTime[].ControlCode] - The control code(s) for the split.
 * @param {Array<string>} [result.SplitTime[].Time] - The time(s) for the split.
 * @returns {Promise<Object>} An object summarizing the changes made:
 * - `created` {number}: The number of splits created.
 * - `updated` {number}: The number of splits updated.
 * - `deleted` {number}: The number of splits deleted.
 * - `changeMade` {boolean}: Whether any changes were made (true if splits were created, updated, or deleted).
 */
async function upsertSplits(competitorId, result) {
  const dbSplitResponse = await prisma.split.findMany({
    where: { competitorId: competitorId },
    select: {
      id: true,
      controlCode: true,
      time: true,
    },
  });

  const splitTimes = result.SplitTime || [];
  const incomingSplits = splitTimes
    .map((split) => ({
      controlCode: split.ControlCode?.[0]
        ? parseInt(split.ControlCode[0])
        : null,
      time: split.Time?.[0] ? parseInt(split.Time[0]) : null,
    }))
    .filter((split) => split.controlCode !== null);

  // Create a map of existing splits for quick lookup
  const existingSplitsMap = new Map(
    dbSplitResponse.map((split) => [split.controlCode, split]),
  );

  // Track splits to create, update, and delete
  const splitsToCreate = [];
  const splitsToUpdate = [];
  const existingControlCodes = new Set();
  let updated = false;

  for (const incomingSplit of incomingSplits) {
    const existingSplit = existingSplitsMap.get(incomingSplit.controlCode);
    if (existingSplit) {
      existingControlCodes.add(incomingSplit.controlCode);
      if (existingSplit.time !== incomingSplit.time) {
        splitsToUpdate.push({
          id: existingSplit.id,
          time: incomingSplit.time,
        });
        updated = true;
      }
    } else {
      splitsToCreate.push({
        competitorId: competitorId,
        controlCode: incomingSplit.controlCode,
        time: incomingSplit.time,
      });
      updated = true;
    }
  }

  const splitsToDelete = dbSplitResponse.filter(
    (split) => !existingControlCodes.has(split.controlCode),
  );

  if (splitsToDelete.length > 0) {
    updated = true;
  }

  // Perform database operations
  await Promise.all([
    ...splitsToCreate.map((split) => prisma.split.create({ data: split })),
    ...splitsToUpdate.map((split) =>
      prisma.split.update({
        where: { id: split.id },
        data: { time: split.time },
      }),
    ),
    ...splitsToDelete.map((split) =>
      prisma.split.delete({ where: { id: split.id } }),
    ),
  ]);

  return {
    created: splitsToCreate.length,
    updated: splitsToUpdate.length,
    deleted: splitsToDelete.length,
    changeMade: updated,
  };
}

/**
 * Upserts (inserts or updates) a team entry in the database.
 *
 * This function ensures that a team is either created or updated based on its
 * event class and bib number. It prevents duplicate entries while keeping team
 * details up to date. The organisation information is also included in the update.
 *
 * @param {string} eventId - The ID of the event the team is participating in.
 * @param {string} classId - The ID of the class the team belongs to.
 * @param {Object} teamResult - The team result object containing team details (e.g., name, bib number).
 * @param {Object} organisation - The organisation object containing team affiliation details (e.g., name, short name).
 * @returns {Promise<string>} - The ID of the upserted team.
 */
async function upsertTeam(eventId, classId, teamResult, organisation) {
  // Extract team details from the input object
  const teamName = teamResult.Name.shift(); // Shift removes the first element from the array
  const bibNumber = teamResult.BibNumber
    ? parseInt(teamResult.BibNumber.shift())
    : null; // Convert BibNumber to integer

  // Check if the team already exists in the database based on event class and bib number
  const dbRelayResponse = await prisma.team.findFirst({
    where: {
      class: { eventId: eventId }, // Match the team within the correct event class
      bibNumber: bibNumber, // Ensure bib number is the same
    },
    select: { id: true }, // Select only the team ID to optimize query performance
  });

  if (!dbRelayResponse) {
    // If team does not exist, insert a new team entry
    const dbRelayInsert = await prisma.team.create({
      data: {
        class: { connect: { id: classId } }, // Link team to the correct class
        name: teamName, // Set team name
        organisation: organisation?.Name?.[0] || null, // Set organisation name if available
        shortName: organisation?.ShortName?.[0] || null, // Set short name if available
        bibNumber: bibNumber, // Set bib number
      },
    });

    return dbRelayInsert.id; // Return the newly created team ID
  } else {
    // If team exists, update its details to keep them up to date
    const teamId = dbRelayResponse.id;
    await prisma.team.update({
      where: { id: teamId }, // Update the existing team entry
      data: {
        class: { connect: { id: classId } }, // Ensure it stays connected to the correct class
        name: teamName, // Update team name if changed
        organisation: organisation?.Name?.[0] || null, // Update organisation name if changed
        shortName: organisation?.ShortName?.[0] || null, // Update short name if changed
        bibNumber: bibNumber, // Update bib number if changed
      },
    });

    return teamId; // Return the existing team ID
  }
}

/**
 * Processes class starts for an event.
 *
 * @param {string} eventId - The ID of the event.
 * @param {Array} classStarts - The starts of the classes to process.
 * @param {Object} dbClassLists - The database class lists.
 * @param {Object} dbResponseEvent - The database response event.
 * @returns {Promise<void>} A promise that resolves when the processing is complete.
 */
async function processClassStarts(
  eventId,
  classStarts,
  dbClassLists,
  dbResponseEvent,
) {
  await Promise.all(
    classStarts.map(async (classStart) => {
      const classDetails = classStart.Class.shift();

      let length = null,
        climb = null,
        startName = null,
        controlsCount = null;

      if (classStart.Course && classStart.Course.length > 0) {
        length = classStart.Course[0].Length
          ? parseInt(classStart.Course[0].Length)
          : null;
        climb = climb = classStart.Course[0].Climb
          ? parseInt(classStart.Course[0].Climb)
          : null;
        controlsCount = classStart.Course[0].NumberOfControls
          ? parseInt(classStart.Course[0].NumberOfControls)
          : null;
      }
      if (classStart.StartName) startName = classStart.StartName[0];

      const additionalData = {
        length: length,
        climb: climb,
        startName: startName,
        controlsCount: controlsCount,
      };

      const classId = await upsertClass(
        eventId,
        classDetails,
        dbClassLists,
        additionalData,
      );

      if (!dbResponseEvent.relay) {
        // Process Individual Starts
        if (!classStart.PersonStart || classStart.PersonStart.length === 0)
          return;
        await Promise.all(
          classStart.PersonStart.map(async (competitorStart) => {
            const person = competitorStart.Person.shift();
            const organisation = competitorStart.Organisation.shift();
            const start = competitorStart.Start.shift();
            await upsertCompetitor(
              eventId,
              classId,
              person,
              organisation,
              start,
              null,
            );
          }),
        );
      } else {
        // Process Relay Starts
        if (!classStart.TeamStart || classStart.TeamStart.length === 0) return;

        await Promise.all(
          classStart.TeamStart.map(async (teamStart) => {
            const organisation = teamStart.Organisation
              ? [...teamStart.Organisation].shift()
              : null; // Organisation details

            const teamId = await upsertTeam(
              eventId,
              classId,
              teamStart,
              organisation,
            );
            // Process Team Member Starts
            if (
              teamStart.TeamMemberStart &&
              teamStart.TeamMemberStart.length > 0
            ) {
              await Promise.all(
                teamStart.TeamMemberStart.map(async (teamMemberStart) => {
                  const person = teamMemberStart.Person[0];
                  const start = [...teamMemberStart.Start].shift();
                  const leg = [...start.Leg].shift();

                  await upsertCompetitor(
                    eventId,
                    classId,
                    person,
                    organisation,
                    start,
                    null,
                    teamId,
                    leg,
                  );
                }),
              );
            }
          }),
        );
      }
    }),
  );
}

/**
 * Processes class results for an event, updating the database with new or modified data.
 *
 * @param {string} eventId - The ID of the event.
 * @param {Array} classResults - An array of class results to process.
 * @param {Object} dbClassLists - The database class lists.
 * @param {Object} dbResponseEvent - The database response event.
 * @returns {Promise<Array>} - A promise that resolves to an array of updated class IDs.
 */
async function processClassResults(
  eventId,
  classResults,
  dbClassLists,
  dbResponseEvent,
) {
  const updatedClasses = new Set(); // Unique class IDs that had changes
  await Promise.all(
    classResults.map(async (classResult) => {
      const classDetails = classResult.Class.shift();
      const classId = await upsertClass(eventId, classDetails, dbClassLists);

      if (!dbResponseEvent.relay) {
        // Process Individual Results
        if (!classResult.PersonResult || classResult.PersonResult.length === 0)
          return;
        await Promise.all(
          classResult.PersonResult.map(async (competitorResult) => {
            const person = competitorResult.Person.shift();
            // const organisation = competitorResult.Organisation?.shift();

            const organisation =
              Array.isArray(competitorResult.Organisation) &&
              competitorResult.Organisation.length > 0
                ? competitorResult.Organisation.shift()
                : null;

            const result =
              Array.isArray(competitorResult.Result) &&
              competitorResult.Result.length > 0
                ? competitorResult.Result.shift()
                : null;

            const { id: competitorId, updated } = await upsertCompetitor(
              eventId,
              classId,
              person,
              organisation,
              null,
              result,
            );
            const { changeMade: updatedSplits } = await upsertSplits(
              competitorId,
              result,
            );
            if (updated || updatedSplits) updatedClasses.add(classId);
          }),
        );
        if (dbResponseEvent.ranking) {
          const rankingCalculation = calculateCompetitorRankingPoints(eventId);
          if (!rankingCalculation) {
            console.log('Ranking points cannot be calculated');
          }
        }
      } else {
        // Process Relay Results
        if (!classResult.TeamResult || classResult.TeamResult.length === 0)
          return;

        await Promise.all(
          classResult.TeamResult.map(async (teamResult) => {
            const organisation = teamResult.Organisation
              ? [...teamResult.Organisation].shift()
              : null; // Organisation details

            const teamId = await upsertTeam(
              eventId,
              classId,
              teamResult,
              organisation,
            );
            // Process Team Member Results
            if (
              teamResult.TeamMemberResult &&
              teamResult.TeamMemberResult.length > 0
            ) {
              if (
                Array.isArray(teamResult.TeamMemberResult) &&
                teamResult.TeamMemberResult.length > 0
              ) {
                await Promise.all(
                  teamResult.TeamMemberResult.map(async (teamMemberResult) => {
                    if (!teamMemberResult?.Person?.[0]) return;
                    const person = teamMemberResult.Person[0];
                    const result = [...teamMemberResult.Result].shift();
                    const leg = [...result.Leg].shift();

                    if (!person || !result || !leg) {
                      console.warn(
                        'Skipping incomplete TeamMemberResult:',
                        teamMemberResult,
                      );
                      return;
                    }

                    const { id: competitorId, updated } =
                      await upsertCompetitor(
                        eventId,
                        classId,
                        person,
                        organisation,
                        null,
                        result,
                        teamId,
                        leg,
                      );
                    const { changeMade: updatedSplits } = await upsertSplits(
                      competitorId,
                      result,
                    );
                    if (updated || updatedSplits) updatedClasses.add(classId);
                  }),
                );
              }
            }
          }),
        );
      }
    }),
  );
  return [...updatedClasses];
}

/**
 * Handles the upload of IOF XML files.
 *
 * @param {Object} req - The request object.
 * @param {Object} req.body - The body of the request.
 * @param {string} req.body.eventId - The ID of the event.
 * @param {string} [req.body.validateXml] - Flag to indicate whether to validate the XML.
 * @param {Object} req.file - The uploaded file.
 * @param {Buffer} req.file.buffer - The buffer of the uploaded file.
 * @param {Object} res - The response object.
 * @returns {Promise<void>} - A promise that resolves when the upload is handled.
 */
async function handleIofXmlUpload(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json(validation(formatErrors(errors)));
  }

  const { eventId, validateXml } = req.body;
  const { userId } = req.jwtDecoded;
  if (!req.file) {
    console.error('File not found');
    return res.status(422).json(validation('No file uploaded', res.statusCode));
  }

  // Process uploaded XML file (compressed or uncompressed)
  // Automatically detects gzip compression and decompresses if needed
  // Returns Buffer containing the raw XML data ready for parsing
  const xmlBuffer = maybeGunzip(req.file);

  if (typeof validateXml === 'undefined' || validateXml !== 'false') {
    const xsd = await fetchIOFXmlSchema();
    const iofXmlValidation = await validateIofXml(xmlBuffer.toString(), xsd);
    if (!iofXmlValidation.state) {
      return res
        .status(422)
        .json(validation(iofXmlValidation.errors));
    }
  }

  let dbResponseEvent;
  try {
    dbResponseEvent = await getEventById(eventId);
  } catch (err) {
    return res.status(500).json(error(err.message, res.statusCode));
  }

  if (!dbResponseEvent) {
    return res.status(404).json(error('Event not found', res.statusCode));
  }

  if (dbResponseEvent.authorId !== userId) {
    return res
      .status(403)
      .json(
        error(
          'You are not authorized to upload data for this event',
          res.statusCode,
        ),
      );
  }

  let iofXml3;
  try {
    iofXml3 = await parseXml(xmlBuffer);
  } catch (err) {
    return res.status(500).json(error(err.message, res.statusCode));
  }

  const iofXmlType = checkXmlType(iofXml3);
  let dbClassLists;
  try {
    dbClassLists = await getClassLists(eventId);
  } catch (err) {
    return res.status(500).json(error(err.message, res.statusCode));
  }

  const eventName = iofXml3[Object.keys(iofXml3)[0]]['Event'][0]['Name'];

  await Promise.all(
    iofXmlType.map(async (type) => {
      if (type.jsonKey === 'ResultList') {
        const classResults = iofXml3.ResultList.ClassResult;
        if (classResults && classResults.length > 0) {
          const updatedClasses = await processClassResults(
            eventId,
            classResults,
            dbClassLists,
            dbResponseEvent,
          );
          notifyWinnerChanges(eventId);
          for (const classId of updatedClasses) {
            try {
              await publishUpdatedCompetitors(classId); // Process sequentially
            } catch (err) {
              console.error(
                `Error publishing competitors update for classId ${classId}:`,
                err,
              );
            }
          }
        }
      } else if (type.jsonKey === 'StartList') {
        const classStarts = iofXml3.StartList.ClassStart;
        if (classStarts && classStarts.length > 0) {
          await processClassStarts(
            eventId,
            classStarts,
            dbClassLists,
            dbResponseEvent,
          );
        }
      } else if (type.jsonKey === 'CourseData') {
        // Process CourseData
        let dbClassLists;
        try {
          dbClassLists = await prisma.class.findMany({
            where: { eventId: eventId },
            select: {
              id: true,
              name: true,
            },
          });
        } catch (err) {
          console.error(err);
          return res.status(500).json(error(`Database error: ${err.message}`));
        }

        const courseData = iofXml3.CourseData.RaceCourseData[0].Course;
        await Promise.all(
          courseData.map(async (course) => {
            const classDetails = {
              Name: [course.Name[0]],
              Id: [],
              ATTR: {},
            };
            const additionalData = {
              length: course.Length && parseInt(course.Length[0]),
              climb: course.Climb && parseInt(course.Climb[0]),
              controlsCount:
                course.CourseControl && course.CourseControl.length - 2,
            };

            await upsertClass(
              eventId,
              classDetails,
              dbClassLists,
              additionalData,
            );
          }),
        );
      }
    }),
  );

  return res
    .status(200)
    .json(
      success(
        'OK',
        { data: 'Iof xml uploaded successfully: ' + eventName },
        res.statusCode,
      ),
    );
}

/**
 * Detects and decompresses gzipped files if necessary
 *
 * Checks for gzip compression using both magic number detection (first two bytes: 0x1F 0x8B)
 * and file metadata hints (MIME type or file extension). If gzip is detected,
 * the file is automatically decompressed synchronously.
 *
 * @param file - The file object containing buffer and metadata
 * @param file.buffer - The file content as Buffer
 * @param file.mimetype - MIME type of the file (e.g., 'application/gzip')
 * @param file.originalname - Original filename (e.g., 'data.xml.gz')
 * @returns Buffer - Decompressed content if gzipped, original buffer otherwise
 *
 * @throws {Error} If gzip decompression fails (corrupted or invalid gzip data)
 */
function maybeGunzip(file) {
  const buf = file.buffer;
  const looksGzip = buf?.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const hintedGzip = /application\/(x-)?gzip/i.test(file.mimetype || '') || /\.gz$/i.test(file.originalname || '');
  if (looksGzip || hintedGzip) {
    return zlib.gunzipSync(buf); // nebo async variantu: await gunzip(...)
  }
  return buf;
}

// Link all submodules here

// Verify user authentication
//TODO: Restrucure the code for better readability
router.use(verifyJwtToken);

// Upload routes

/**
 * @swagger
 * /rest/v1/upload/iof:
 *  post:
 *    summary: Upload IOX XML 3
 *    description: Upload data file containing the classes specifications, start list or result list.
 *    parameters:
 *       - in: body
 *         name: eventId
 *         required: true
 *         description: String ID of the event to upload data.
 *         schema:
 *           type: string
 *    responses:
 *      200:
 *        description: Iof xml uploaded successfully
 *      422:
 *        description: Validation errors
 *      500:
 *        description: Internal server error
 */
router.post(
  '/iof',
  upload,
  [
    check('eventId').not().isEmpty().isString(),
    check('validateXml').isBoolean().optional(),
  ],
  handleIofXmlUpload,
);

/**
 * @swagger
 * /rest/v1/upload/czech-ranking:
 *  post:
 *    summary: Upload CSV with Czech Ranking Data for the current month
 *    description: Upload data file containing ranking data for czech competition rules.
 *    parameters:
 *       - in: body
 *         name: file
 *         required: true
 *         description: CSV File downloaded from ORIS system.
 *         schema:
 *           type: file
 *    responses:
 *      200:
 *        description: Iof xml uploaded successfully
 *      422:
 *        description: Validation errors
 *      500:
 *        description: Internal server error
 */
router.post('/czech-ranking', upload, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json(validation(formatErrors(errors)));
  }
  if (!req.file) {
    console.error('File not found');
    return res.status(422).json(validation('No file uploaded', res.statusCode));
  }

  if (req.file.size > 2000000) {
    console.error('File is too large');
    return res
      .status(422)
      .json(
        validation(
          'File is too large. Allowed size is up to 2MB',
          res.statusCode,
        ),
      );
  }

  try {
    const processedRankingData = await storeCzechRankingData(
      req.file.buffer.toString(),
    );
    return res.status(200).json(
      success(
        'OK',
        {
          data:
            'Csv ranking Czech data uploaded successfully: ' +
            processedRankingData,
        },
        res.statusCode,
      ),
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json(error(err.message, res.statusCode));
  }
});

export const parseXmlForTesting = {
  parseXml,
  checkXmlType,
  fetchIOFXmlSchema,
  upsertCompetitor,
};

export default router;
