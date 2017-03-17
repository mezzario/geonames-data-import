USE %s;

LOAD DATA LOCAL INFILE '%s'
INTO TABLE hierarchy
CHARACTER SET 'UTF8MB4'
(parentId, childId, type);
