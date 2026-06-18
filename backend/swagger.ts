import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';

// 1. Global Swagger Configurations
const options: swaggerJSDoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'My TypeScript Account API',
            version: '1.0.0',
            description: 'A simple financial account management API documentation',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Development Server',
            },
        ],
    },
    // 2. Path to the API docs (Where you write your endpoint documentations)
    // This tells swagger to look into your routes folder for files ending in .ts or .js
    apis: ['./routes/*.ts', './src/routes/*.js', './src/controllers/*.ts'], 
};

const swaggerSpec = swaggerJSDoc(options);
//link swagger to express app
export const setupSwagger = (app: Express): void => {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    console.log('📝 Swagger Docs available at http://localhost:3000/api-docs');
};