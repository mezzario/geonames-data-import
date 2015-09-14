USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE postalCodes
CHARACTER SET 'UTF8'
(country, postal_code, name, admin1_name, admin1_code, admin2_name, admin2_code, admin3_name, admin3_code, latitude, longitude, accuracy)
