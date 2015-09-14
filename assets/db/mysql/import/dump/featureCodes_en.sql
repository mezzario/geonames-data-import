USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE featureCodes
CHARACTER SET 'UTF8'
(code, name, description);
