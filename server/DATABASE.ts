import mysql from 'mysql2';
import { databaseMap, queries, QUERIES, queryArgType, expectedQueryReturnType, DATABASES } from '@azor.server/queries';
import { MYSQL_ENDPOINT, MYSQL_USER, MYSQL_PASSWORD } from '@azor.lib/conf.env';

export class DATABASE {
	private connections: Map<DATABASES, mysql.Connection> = new Map();

	constructor() { }

	private getConnection(database: DATABASES): mysql.Connection {
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

	private closeConnection(database: DATABASES): void {
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

	public query = {
		[QUERIES.GET_CHARACTER_BY_NAME]:
			(args: queryArgType[QUERIES.GET_CHARACTER_BY_NAME]) =>
				this.db_query<expectedQueryReturnType[QUERIES.GET_CHARACTER_BY_NAME]>(QUERIES.GET_CHARACTER_BY_NAME, args),

		[QUERIES.GET_ONLINE_CHARACTERS]:
			(args: queryArgType[QUERIES.GET_ONLINE_CHARACTERS]) =>
				this.db_query<expectedQueryReturnType[QUERIES.GET_ONLINE_CHARACTERS]>(QUERIES.GET_ONLINE_CHARACTERS, args),
			
		[QUERIES.GET_ITEM_BY_ENTRY]:
			(args: queryArgType[QUERIES.GET_ITEM_BY_ENTRY]) =>
				this.db_query<expectedQueryReturnType[QUERIES.GET_ITEM_BY_ENTRY]>(QUERIES.GET_ITEM_BY_ENTRY, args)
	}

	private db_query<T>(_Q: QUERIES, args: queryArgType[typeof _Q]): Promise<T> {
	
		const database = databaseMap[_Q];
		const query = queries({ _Q, args });

		if (!this.connections.has(database)) {
			console.warn(`No connection found for database: ${database}, executing query on a new connection.`);
			this.getConnection(database);
		}

		return new Promise((resolve, reject) => {
			const _C = this.getConnection(database);
			_C.query(query, args, (error, results) => {
				if (error) {
					console.error(`Error executing query on ${database}:`, error);
					reject(error);
				} else {
					resolve(results as T);
				}
			});
		});
	}
}