USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE continentCodes
CHARACTER SET 'UTF8'
FIELDS TERMINATED BY ','
(code, name, geonameId);
