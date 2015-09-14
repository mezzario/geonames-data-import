USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE admin1CodesAscii
CHARACTER SET 'UTF8'
(code, name, nameAscii, geonameid);
