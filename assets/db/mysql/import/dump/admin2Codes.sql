USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE admin2Codes
CHARACTER SET 'UTF8'
(code, name, nameAscii, geonameid);
