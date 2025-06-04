import mysql from 'mysql2';
import { databaseMap, queries, QUERIES, queryArgs, expectedQueryReturnType, DATABASES } from './queries';
import { MYSQL_ENDPOINT, MYSQL_USER, MYSQL_PASSWORD } from '../lib/env';

export class DATABASE {
	private connections: Map<DATABASES, mysql.Connection> = new Map();

	constructor() { }

	public getConnection(database: DATABASES): mysql.Connection {
		if (this.connections.has(database)) return this.connections.get(database) as mysql.Connection;

		const _C = mysql.createConnection({
			host: MYSQL_ENDPOINT,
			user: MYSQL_USER,
			password: MYSQL_PASSWORD,
			database: database as string
		});
		this.connections.set(database, _C);

		return _C;
	}

	public closeConnection(database: DATABASES): void {
		if (this.connections.has(database)) {
			const _C = this.connections.get(database);
			_C?.end(err => {
				if (err) {
					console.error(`Error closing connection to ${database}:`, err);
				} else {
					console.log(`Connection to ${database} closed successfully.`);
				}
			});
			this.connections.delete(database);
		} else {
			console.warn(`No connection found for database: ${database}`);
		}
	}

	public query(_Q: QUERIES, values: queryArgs[typeof _Q]): Promise<expectedQueryReturnType[typeof _Q]> {
		const database = databaseMap[_Q];
		const query = queries[_Q]({ args: values});

		if (!this.connections.has(database)) {
			console.warn(`No connection found for database: ${database}, executing query on a new connection.`);
			this.getConnection(database);
		}

		return new Promise((resolve, reject) => {
			const _C = this.getConnection(database);
			_C.query(query, values, (error, results) => {
				if (error) {
					console.error(`Error executing query on ${database}:`, error);
					reject(error);
				} else {
					resolve((results as Array<{}>)[0] as expectedQueryReturnType[typeof _Q]);
				}
			});
		});
	}
}