USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE featureCodes
CHARACTER SET 'UTF8MB4'
(code, name, description);
