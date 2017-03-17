USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE admin1CodesAscii
CHARACTER SET 'UTF8MB4'
(code, name, nameAscii, geonameid);
