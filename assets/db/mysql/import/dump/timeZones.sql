USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE timeZones
CHARACTER SET 'UTF8'
IGNORE 1 LINES
(countryCode, timeZoneId, GMT_offset, DST_offset, rawOffset);
