import { GraphQLScalarType, Kind } from 'graphql';

export const DateScalar = new GraphQLScalarType({
    name: 'Date',
    description: 'ISO-8601 Date string',

    serialize(value) {
        // value from Prisma → outgoing value
        return new Date(value).toISOString();
    },

    parseValue(value) {
        // client input → JS Date
        return new Date(value);
    },

    parseLiteral(ast) {
        if (ast.kind === Kind.STRING) {
            return new Date(ast.value);
        }
        return null;
    },
});
