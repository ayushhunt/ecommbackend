import { Router } from 'express';
import {
  getUserStatistics,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserAddresses,
  toggleUserVerification,
  getGeographicDistribution,
  searchUsers
} from '../controllers/admin/user.controller';


const router = Router();


// Statistics routes
router.get('/statistics', getUserStatistics);
router.get('/geographic-distribution', getGeographicDistribution);

// User management routes
router.get('/search', searchUsers);
router.get('/', getAllUsers);
router.get('/:userId', getUserById);
router.put('/:userId', updateUser);
router.delete('/:userId', deleteUser);

// User-specific routes
router.get('/:userId/addresses', getUserAddresses);
router.patch('/:userId/toggle-verification', toggleUserVerification);

export default router;